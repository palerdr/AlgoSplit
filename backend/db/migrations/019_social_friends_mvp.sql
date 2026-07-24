-- Social MVP: private profiles, mutual friendships, sanitized stimulus
-- snapshots, opt-in activity/lift cards, and immutable split shares.
--
-- Raw workout rows and the owner-only analysis_snapshots cache are never
-- referenced by a friend-facing policy. Every shared artifact is an explicit,
-- immutable publication that becomes unreadable immediately when visibility
-- is revoked, a friendship ends, or a block is created.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    handle TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    discoverable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_handle_format CHECK (
        handle = LOWER(handle)
        AND handle ~ '^[a-z0-9_]{3,24}$'
    ),
    CONSTRAINT profiles_display_name_length CHECK (
        CHAR_LENGTH(display_name) BETWEEN 1 AND 60
    ),
    CONSTRAINT profiles_avatar_url_length CHECK (
        avatar_url IS NULL OR CHAR_LENGTH(avatar_url) <= 2048
    )
);

CREATE UNIQUE INDEX profiles_handle_unique
    ON public.profiles (LOWER(handle));

CREATE TABLE public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_low UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_high UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
    blocked_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT friendships_canonical_pair CHECK (user_low < user_high),
    CONSTRAINT friendships_requester_in_pair CHECK (
        requester_id IN (user_low, user_high)
    ),
    CONSTRAINT friendships_block_state CHECK (
        (status = 'blocked' AND blocked_by IN (user_low, user_high))
        OR (status <> 'blocked' AND blocked_by IS NULL)
    ),
    UNIQUE (user_low, user_high)
);

CREATE INDEX friendships_low_status_idx
    ON public.friendships (user_low, status);
CREATE INDEX friendships_high_status_idx
    ON public.friendships (user_high, status);
CREATE INDEX friendships_requester_status_idx
    ON public.friendships (requester_id, status);

CREATE TABLE public.friend_visibility_settings (
    owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    stimulus_body BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_activity BOOLEAN NOT NULL DEFAULT FALSE,
    lift_progress BOOLEAN NOT NULL DEFAULT FALSE,
    shared_splits BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.social_stimulus_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    region_stimulus JSONB NOT NULL,
    calculation_window_start DATE NOT NULL,
    calculation_window_end DATE NOT NULL,
    calculation_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_analysis_updated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT social_stimulus_window_order CHECK (
        calculation_window_start <= calculation_window_end
    ),
    CONSTRAINT social_stimulus_regions_object CHECK (
        JSONB_TYPEOF(region_stimulus) = 'object'
        AND JSONB_ARRAY_LENGTH(
            JSONB_PATH_QUERY_ARRAY(region_stimulus, '$.keyvalue()')
        ) = 29
    ),
    CONSTRAINT social_stimulus_settings_object CHECK (
        JSONB_TYPEOF(calculation_settings) = 'object'
    )
);

CREATE INDEX social_stimulus_owner_published_idx
    ON public.social_stimulus_snapshots (owner_id, published_at DESC);

CREATE TABLE public.social_weekly_activity_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    workouts_completed SMALLINT NOT NULL
        CHECK (workouts_completed BETWEEN 0 AND 21),
    planned_workouts SMALLINT
        CHECK (planned_workouts IS NULL OR planned_workouts BETWEEN 0 AND 21),
    consistency_percent SMALLINT NOT NULL
        CHECK (consistency_percent BETWEEN 0 AND 100),
    snapshot_date DATE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT social_activity_week_order CHECK (week_start <= week_end)
);

CREATE INDEX social_activity_owner_published_idx
    ON public.social_weekly_activity_cards (owner_id, published_at DESC);

CREATE TABLE public.social_lift_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL CHECK (CHAR_LENGTH(exercise_name) BETWEEN 1 AND 120),
    change_percent NUMERIC(7, 2) NOT NULL
        CHECK (change_percent BETWEEN -999.99 AND 999.99),
    period_label TEXT NOT NULL CHECK (CHAR_LENGTH(period_label) BETWEEN 1 AND 40),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX social_lifts_owner_published_idx
    ON public.social_lift_trends (owner_id, published_at DESC);

CREATE TABLE public.social_split_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_split_id UUID REFERENCES public.splits(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    split_name TEXT NOT NULL CHECK (CHAR_LENGTH(split_name) BETWEEN 1 AND 200),
    split_version JSONB NOT NULL,
    analysis_version JSONB,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT split_share_not_self CHECK (
        recipient_id IS NULL OR recipient_id <> owner_id
    ),
    CONSTRAINT split_share_payload_object CHECK (
        JSONB_TYPEOF(split_version) = 'object'
    ),
    CONSTRAINT split_share_analysis_object CHECK (
        analysis_version IS NULL OR JSONB_TYPEOF(analysis_version) = 'object'
    )
);

CREATE INDEX social_split_shares_owner_published_idx
    ON public.social_split_shares (owner_id, published_at DESC);
CREATE INDEX social_split_shares_recipient_published_idx
    ON public.social_split_shares (recipient_id, published_at DESC)
    WHERE recipient_id IS NOT NULL;
CREATE INDEX social_split_shares_source_split_idx
    ON public.social_split_shares (source_split_id)
    WHERE source_split_id IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_stimulus_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_weekly_activity_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_lift_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_split_shares ENABLE ROW LEVEL SECURITY;

-- A profile is visible to its owner and to the other party while a request is
-- pending or accepted. Exact pre-request lookup is provided by the bounded RPC
-- below, preventing a listable global directory.
CREATE POLICY "Profiles visible to owner and social counterpart"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.status IN ('pending', 'accepted')
              AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
              AND user_id IN (f.user_low, f.user_high)
        )
    );

CREATE POLICY "Users create own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Friendship participants can read"
    ON public.friendships FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) IN (user_low, user_high));

CREATE POLICY "Users can initiate requests or blocks"
    ON public.friendships FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = requester_id
        AND (SELECT auth.uid()) IN (user_low, user_high)
        AND (
            (status = 'pending' AND blocked_by IS NULL)
            OR (status = 'blocked' AND blocked_by = (SELECT auth.uid()))
        )
    );

CREATE POLICY "Participants can respond or block"
    ON public.friendships FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) IN (user_low, user_high))
    WITH CHECK (
        (SELECT auth.uid()) IN (user_low, user_high)
        AND (
            (
                status = 'accepted'
                AND requester_id <> (SELECT auth.uid())
                AND blocked_by IS NULL
            )
            OR (
                status = 'declined'
                AND requester_id <> (SELECT auth.uid())
                AND blocked_by IS NULL
            )
            OR (
                status = 'blocked'
                AND blocked_by = (SELECT auth.uid())
            )
        )
    );

CREATE POLICY "Participants can remove non-blocked friendships"
    ON public.friendships FOR DELETE TO authenticated
    USING (
        (SELECT auth.uid()) IN (user_low, user_high)
        AND (
            status <> 'blocked'
            OR blocked_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "Owners and accepted friends read visibility"
    ON public.friend_visibility_settings FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = owner_id
        OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
              AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
              AND owner_id IN (f.user_low, f.user_high)
        )
    );

CREATE POLICY "Users create own visibility"
    ON public.friend_visibility_settings FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Users update own visibility"
    ON public.friend_visibility_settings FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = owner_id)
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners and permitted friends read stimulus publications"
    ON public.social_stimulus_snapshots FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = owner_id
        OR (
            EXISTS (
                SELECT 1 FROM public.friendships f
                WHERE f.status = 'accepted'
                  AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
                  AND owner_id IN (f.user_low, f.user_high)
            )
            AND EXISTS (
                SELECT 1 FROM public.friend_visibility_settings v
                WHERE v.owner_id = social_stimulus_snapshots.owner_id
                  AND v.stimulus_body
            )
        )
    );

CREATE POLICY "Owners publish stimulus snapshots"
    ON public.social_stimulus_snapshots FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners delete stimulus snapshots"
    ON public.social_stimulus_snapshots FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners and permitted friends read weekly cards"
    ON public.social_weekly_activity_cards FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = owner_id
        OR (
            EXISTS (
                SELECT 1 FROM public.friendships f
                WHERE f.status = 'accepted'
                  AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
                  AND owner_id IN (f.user_low, f.user_high)
            )
            AND EXISTS (
                SELECT 1 FROM public.friend_visibility_settings v
                WHERE v.owner_id = social_weekly_activity_cards.owner_id
                  AND v.weekly_activity
            )
        )
    );

CREATE POLICY "Owners publish weekly cards"
    ON public.social_weekly_activity_cards FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners delete weekly cards"
    ON public.social_weekly_activity_cards FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners and permitted friends read lift trends"
    ON public.social_lift_trends FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = owner_id
        OR (
            EXISTS (
                SELECT 1 FROM public.friendships f
                WHERE f.status = 'accepted'
                  AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
                  AND owner_id IN (f.user_low, f.user_high)
            )
            AND EXISTS (
                SELECT 1 FROM public.friend_visibility_settings v
                WHERE v.owner_id = social_lift_trends.owner_id
                  AND v.lift_progress
            )
        )
    );

CREATE POLICY "Owners publish lift trends"
    ON public.social_lift_trends FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners delete lift trends"
    ON public.social_lift_trends FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners and intended friends read split shares"
    ON public.social_split_shares FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = owner_id
        OR (
            revoked_at IS NULL
            AND (recipient_id IS NULL OR recipient_id = (SELECT auth.uid()))
            AND EXISTS (
                SELECT 1 FROM public.friendships f
                WHERE f.status = 'accepted'
                  AND (SELECT auth.uid()) IN (f.user_low, f.user_high)
                  AND owner_id IN (f.user_low, f.user_high)
            )
            AND EXISTS (
                SELECT 1 FROM public.friend_visibility_settings v
                WHERE v.owner_id = social_split_shares.owner_id
                  AND v.shared_splits
            )
        )
    );

CREATE POLICY "Owners publish split shares"
    ON public.social_split_shares FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners revoke split shares"
    ON public.social_split_shares FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = owner_id)
    WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners delete split shares"
    ON public.social_split_shares FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

-- Protect friendship identity columns and immutable publication payloads even
-- when a caller talks directly to PostgREST.
CREATE OR REPLACE FUNCTION private.guard_friendship_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.user_low <> OLD.user_low
       OR NEW.user_high <> OLD.user_high
       OR NEW.requester_id <> OLD.requester_id
       OR NEW.requested_at <> OLD.requested_at THEN
        RAISE EXCEPTION 'friendship identity is immutable' USING ERRCODE = '22000';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_friendship_identity_before_update
    BEFORE UPDATE ON public.friendships
    FOR EACH ROW EXECUTE FUNCTION private.guard_friendship_identity();

CREATE OR REPLACE FUNCTION private.guard_split_share_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.owner_id <> OLD.owner_id
       OR NEW.source_split_id IS DISTINCT FROM OLD.source_split_id
       OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
       OR NEW.split_name <> OLD.split_name
       OR NEW.split_version <> OLD.split_version
       OR NEW.analysis_version IS DISTINCT FROM OLD.analysis_version
       OR NEW.published_at <> OLD.published_at THEN
        RAISE EXCEPTION 'published split versions are immutable' USING ERRCODE = '22000';
    END IF;
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
        RAISE EXCEPTION 'revoked split shares cannot be restored' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_split_share_immutability_before_update
    BEFORE UPDATE ON public.social_split_shares
    FOR EACH ROW EXECUTE FUNCTION private.guard_split_share_immutability();

CREATE OR REPLACE FUNCTION private.set_social_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION private.set_social_updated_at();

CREATE TRIGGER visibility_set_updated_at
    BEFORE UPDATE ON public.friend_visibility_settings
    FOR EACH ROW EXECUTE FUNCTION private.set_social_updated_at();

-- Exact-handle lookup is deliberately implemented in a non-exposed
-- SECURITY DEFINER helper. The narrowly granted public bridge is required by
-- PostgREST RPC discovery; it exposes only the exact-match helper, returns
-- sanitized columns, and cannot list or prefix-search the profile table.
CREATE OR REPLACE FUNCTION private.lookup_profile_by_handle_exact(p_handle TEXT)
RETURNS TABLE (
    user_id UUID,
    handle TEXT,
    display_name TEXT,
    avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.user_id, p.handle, p.display_name, p.avatar_url
    FROM public.profiles p
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND p.discoverable
      AND p.user_id <> (SELECT auth.uid())
      AND p.handle = LOWER(TRIM(p_handle))
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.lookup_profile_by_handle_exact(TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lookup_profile_by_handle(p_handle TEXT)
RETURNS TABLE (
    user_id UUID,
    handle TEXT,
    display_name TEXT,
    avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT * FROM private.lookup_profile_by_handle_exact(p_handle)
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_by_handle(TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_handle(TEXT) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.friend_visibility_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_stimulus_snapshots TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_weekly_activity_cards TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_lift_trends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_split_shares TO authenticated;

COMMENT ON TABLE public.social_stimulus_snapshots IS
    'Sanitized immutable friend-facing stimulus publications; never raw workouts or analysis cache rows.';
COMMENT ON TABLE public.social_split_shares IS
    'Immutable serialized split and analysis versions with explicit revocation.';
