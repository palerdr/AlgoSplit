-- Immutable, expiring split snapshots for copy-link sharing.
--
-- Raw share tokens never enter PostgreSQL. The API stores only their SHA-256
-- hex digests and public resolution is limited to one exact digest at a time.

CREATE TABLE IF NOT EXISTS public.split_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_split_id UUID NOT NULL REFERENCES public.splits(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    snapshot JSONB NOT NULL
        CHECK (jsonb_typeof(snapshot) = 'object')
        CHECK (
            snapshot ?& ARRAY[
                'name',
                'cycle_length',
                'stimulus_duration',
                'maintenance_volume',
                'dataset',
                'sessions'
            ]
        )
        CHECK (
            snapshot - ARRAY[
                'name',
                'cycle_length',
                'stimulus_duration',
                'maintenance_volume',
                'dataset',
                'sessions'
            ] = '{}'::JSONB
        )
        CHECK (jsonb_typeof(snapshot->'sessions') = 'array')
        CHECK (jsonb_array_length(snapshot->'sessions') > 0)
        CHECK (octet_length(snapshot::TEXT) <= 65536),
    nonportable_exercises TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
        CHECK (array_position(nonportable_exercises, NULL) IS NULL),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (expires_at <= created_at + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_split_shares_owner_source_expiry
    ON public.split_shares(user_id, source_split_id, expires_at);

-- A recipient/share pair maps to at most one independently owned split. This
-- table is backend-private because it contains recipient and copied-row IDs.
CREATE TABLE IF NOT EXISTS public.split_share_copies (
    share_id UUID NOT NULL
        REFERENCES public.split_shares(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    copied_split_id UUID NOT NULL UNIQUE
        REFERENCES public.splits(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (share_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_split_share_copies_recipient
    ON public.split_share_copies(recipient_user_id);

ALTER TABLE public.split_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_share_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS split_shares_owner_select ON public.split_shares;
CREATE POLICY split_shares_owner_select
    ON public.split_shares
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS split_shares_owner_insert ON public.split_shares;
CREATE POLICY split_shares_owner_insert
    ON public.split_shares
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND EXISTS (
            SELECT 1
            FROM public.splits AS owned_split
            WHERE owned_split.id = source_split_id
              AND owned_split.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS split_shares_owner_delete ON public.split_shares;
CREATE POLICY split_shares_owner_delete
    ON public.split_shares
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- There is intentionally no UPDATE policy or grant. Keep an explicit trigger
-- as defense in depth for elevated clients: a share is replaced, never edited.
CREATE OR REPLACE FUNCTION public.reject_split_share_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    RAISE EXCEPTION 'split_shares_are_immutable' USING ERRCODE = '55000';
END
$function$;

DROP TRIGGER IF EXISTS reject_split_share_updates ON public.split_shares;
CREATE TRIGGER reject_split_share_updates
    BEFORE UPDATE ON public.split_shares
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_split_share_updates();

DROP TRIGGER IF EXISTS reject_split_share_copy_updates
    ON public.split_share_copies;
CREATE TRIGGER reject_split_share_copy_updates
    BEFORE UPDATE ON public.split_share_copies
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_split_share_updates();

-- Direct Data API access is deliberately unavailable. Authenticated callers
-- use the narrow functions below, each of which checks auth.uid() explicitly.
REVOKE ALL ON public.split_shares FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.split_share_copies FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_split_share(
    p_split_id UUID,
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_snapshot JSONB;
    v_created_at TIMESTAMPTZ := now();
    v_expires_at TIMESTAMPTZ;
    v_active_count INTEGER;
    v_total_active_count INTEGER;
    v_nonportable_exercises TEXT[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'invalid_token_hash' USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_build_object(
        'name', owned_split.name,
        'cycle_length', owned_split.cycle_length,
        'stimulus_duration', owned_split.stimulus_duration,
        'maintenance_volume', owned_split.maintenance_volume,
        'dataset', owned_split.dataset,
        'sessions', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', split_session.name,
                    'day_number', split_session.day_number,
                    'exercises', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'name', exercise.exercise_name,
                                'sets', exercise.sets,
                                'unilateral', exercise.unilateral,
                                'resistance_profile', exercise.resistance_profile
                            )
                            ORDER BY exercise.order_index, exercise.id
                        )
                        FROM public.exercises AS exercise
                        WHERE exercise.session_id = split_session.id
                    ), '[]'::JSONB)
                )
                ORDER BY split_session.day_number, split_session.id
            )
            FROM public.sessions AS split_session
            WHERE split_session.split_id = owned_split.id
        ), '[]'::JSONB)
    )
    INTO v_snapshot
    FROM public.splits AS owned_split
    WHERE owned_split.id = p_split_id
      AND owned_split.user_id = v_user_id;

    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'split_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF jsonb_array_length(v_snapshot->'sessions') = 0 THEN
        RAISE EXCEPTION 'split_not_shareable' USING ERRCODE = '22023';
    END IF;
    -- Legacy databases accepted wider values than the current SplitCreate
    -- contract. Reject those rows before minting a link that the public API
    -- would later refuse to resolve.
    IF char_length(btrim(COALESCE(v_snapshot->>'name', ''))) NOT BETWEEN 1 AND 200
       OR (v_snapshot->>'stimulus_duration')::INTEGER NOT BETWEEN 24 AND 96
       OR (v_snapshot->>'maintenance_volume')::INTEGER NOT BETWEEN 1 AND 9
       OR v_snapshot->>'dataset' NOT IN ('schoenfeld', 'pelland', 'average')
       OR (
            v_snapshot->'cycle_length' <> 'null'::JSONB
            AND (v_snapshot->>'cycle_length')::INTEGER NOT BETWEEN 1 AND 14
       )
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_snapshot->'sessions') AS session_item(session)
            WHERE char_length(btrim(COALESCE(session->>'name', ''))) < 1
               OR (session->>'day_number')::INTEGER NOT BETWEEN 1 AND 14
               OR (
                    v_snapshot->'cycle_length' <> 'null'::JSONB
                    AND (session->>'day_number')::INTEGER >
                        (v_snapshot->>'cycle_length')::INTEGER
               )
               OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(session->'exercises')
                        AS exercise_item(exercise)
                    WHERE char_length(
                        btrim(COALESCE(exercise->>'name', ''))
                    ) < 1
                       OR (exercise->>'sets')::INTEGER <= 0
                       OR (
                            exercise->'resistance_profile' <> 'null'::JSONB
                            AND exercise->>'resistance_profile'
                                NOT IN ('ascending', 'mid', 'descending')
                       )
               )
       )
    THEN
        RAISE EXCEPTION 'split_not_shareable' USING ERRCODE = '22023';
    END IF;
    IF octet_length(v_snapshot::TEXT) > 65536 THEN
        RAISE EXCEPTION 'snapshot_too_large' USING ERRCODE = '54000';
    END IF;

    -- Freeze the owner-scoped meanings that cannot safely travel with a plain
    -- SplitCreate snapshot. Match the analysis lookup's case-insensitive,
    -- surrounding-whitespace-insensitive semantics while preserving the
    -- exercise spelling from the immutable snapshot.
    SELECT COALESCE(
        array_agg(
            DISTINCT source_exercise.exercise_name
            ORDER BY source_exercise.exercise_name
        ),
        ARRAY[]::TEXT[]
    )
    INTO v_nonportable_exercises
    FROM public.sessions AS source_session
    JOIN public.exercises AS source_exercise
      ON source_exercise.session_id = source_session.id
    WHERE source_session.split_id = p_split_id
      AND (
          EXISTS (
              SELECT 1
              FROM public.custom_exercises AS custom_exercise
              WHERE custom_exercise.user_id = v_user_id
                AND lower(btrim(custom_exercise.exercise_name)) =
                    lower(btrim(source_exercise.exercise_name))
          )
          OR EXISTS (
              SELECT 1
              FROM public.exercise_overrides AS exercise_override
              WHERE exercise_override.user_id = v_user_id
                AND lower(btrim(exercise_override.exercise_name)) =
                    lower(btrim(source_exercise.exercise_name))
          )
      );

    -- Serialize share creation per account before checking the caps. Without
    -- this transaction-scoped lock, concurrent RPC calls could all observe
    -- the same pre-insert counts and collectively exceed both limits.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('split_shares:' || v_user_id::TEXT, 0)
    );

    -- Bound storage per account and opportunistically prune that account's
    -- expired capabilities. At most 20 live snapshots (5 per source split)
    -- can remain for one account.
    DELETE FROM public.split_shares AS expired_share
    WHERE expired_share.user_id = v_user_id
      AND expired_share.expires_at <= v_created_at;

    SELECT count(*)::INTEGER
    INTO v_total_active_count
    FROM public.split_shares AS share
    WHERE share.user_id = v_user_id
      AND share.expires_at > v_created_at;

    SELECT count(*)::INTEGER
    INTO v_active_count
    FROM public.split_shares AS share
    WHERE share.user_id = v_user_id
      AND share.source_split_id = p_split_id
      AND share.expires_at > v_created_at;

    IF v_total_active_count >= 20 OR v_active_count >= 5 THEN
        RAISE EXCEPTION 'share_limit_reached' USING ERRCODE = 'P0001';
    END IF;

    v_expires_at := v_created_at + INTERVAL '30 days';
    INSERT INTO public.split_shares(
        user_id,
        source_split_id,
        token_hash,
        snapshot,
        nonportable_exercises,
        expires_at,
        created_at
    )
    VALUES (
        v_user_id,
        p_split_id,
        p_token_hash,
        v_snapshot,
        v_nonportable_exercises,
        v_expires_at,
        v_created_at
    );

    SELECT count(*)::INTEGER
    INTO v_active_count
    FROM public.split_shares AS share
    WHERE share.user_id = v_user_id
      AND share.source_split_id = p_split_id
      AND share.expires_at > now();

    RETURN jsonb_build_object(
        'expires_at', v_expires_at,
        'active_count', v_active_count,
        'review_exercises', to_jsonb(v_nonportable_exercises)
    );
END
$function$;

CREATE OR REPLACE FUNCTION public.get_split_share_status(p_split_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_active_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.splits AS owned_split
        WHERE owned_split.id = p_split_id
          AND owned_split.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'split_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*)::INTEGER
    INTO v_active_count
    FROM public.split_shares AS share
    WHERE share.user_id = v_user_id
      AND share.source_split_id = p_split_id
      AND share.expires_at > now();

    RETURN jsonb_build_object('active_count', v_active_count);
END
$function$;

CREATE OR REPLACE FUNCTION public.revoke_split_shares(p_split_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_revoked_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.splits AS owned_split
        WHERE owned_split.id = p_split_id
          AND owned_split.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'split_not_found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.split_shares AS share
    WHERE share.user_id = v_user_id
      AND share.source_split_id = p_split_id;
    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    RETURN jsonb_build_object('revoked_count', v_revoked_count);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_public_split_share(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
    SELECT jsonb_build_object(
        'split', share.snapshot,
        'expires_at', share.expires_at,
        'review_exercises', to_jsonb(share.nonportable_exercises)
    )
    FROM public.split_shares AS share
    WHERE p_token_hash ~ '^[0-9a-f]{64}$'
      AND share.token_hash = p_token_hash
      AND share.expires_at > now()
    LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.copy_split_share(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_recipient_user_id UUID := (SELECT auth.uid());
    v_share_id UUID;
    v_share public.split_shares%ROWTYPE;
    v_existing_copy JSONB;
    v_recipient_conflicts TEXT[];
    v_review_exercises TEXT[];
    v_copied_split JSONB;
BEGIN
    IF v_recipient_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'shared_split_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT share.id
    INTO v_share_id
    FROM public.split_shares AS share
    WHERE share.token_hash = p_token_hash
      AND share.expires_at > now()
    LIMIT 1;

    IF v_share_id IS NULL THEN
        RAISE EXCEPTION 'shared_split_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- Exactly one copy transaction for a recipient/share pair may proceed.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'split_share_copy:' || v_recipient_user_id::TEXT ||
                ':' || v_share_id::TEXT,
            0
        )
    );

    -- Re-resolve after waiting and hold a key-share lock. Revocation either
    -- commits first (this becomes a 404) or waits for this atomic copy.
    SELECT share.*
    INTO v_share
    FROM public.split_shares AS share
    WHERE share.id = v_share_id
      AND share.token_hash = p_token_hash
      AND share.expires_at > now()
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'shared_split_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- Return the original copied row before re-running conflict checks. This
    -- makes a retry after a lost HTTP response return the same SplitResponse.
    SELECT jsonb_build_object(
        'id', copied.id,
        'user_id', copied.user_id,
        'name', copied.name,
        'cycle_length', copied.cycle_length,
        'stimulus_duration', copied.stimulus_duration,
        'maintenance_volume', copied.maintenance_volume,
        'dataset', copied.dataset,
        'created_at', copied.created_at,
        'updated_at', copied.updated_at,
        'sessions', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', copied_session.id,
                    'split_id', copied_session.split_id,
                    'name', copied_session.name,
                    'day_number', copied_session.day_number,
                    'created_at', copied_session.created_at,
                    'updated_at', copied_session.updated_at,
                    'exercises', COALESCE((
                        SELECT jsonb_agg(
                            to_jsonb(copied_exercise)
                            ORDER BY copied_exercise.order_index
                        )
                        FROM public.exercises AS copied_exercise
                        WHERE copied_exercise.session_id = copied_session.id
                    ), '[]'::JSONB)
                )
                ORDER BY copied_session.day_number
            )
            FROM public.sessions AS copied_session
            WHERE copied_session.split_id = copied.id
        ), '[]'::JSONB)
    )
    INTO v_existing_copy
    FROM public.split_share_copies AS copy_mapping
    JOIN public.splits AS copied
      ON copied.id = copy_mapping.copied_split_id
    WHERE copy_mapping.share_id = v_share.id
      AND copy_mapping.recipient_user_id = v_recipient_user_id
      AND copied.user_id = v_recipient_user_id;

    IF v_existing_copy IS NOT NULL THEN
        RETURN v_existing_copy;
    END IF;

    SELECT COALESCE(
        array_agg(
            DISTINCT exercise_item.value->>'name'
            ORDER BY exercise_item.value->>'name'
        ),
        ARRAY[]::TEXT[]
    )
    INTO v_recipient_conflicts
    FROM jsonb_array_elements(v_share.snapshot->'sessions')
        AS session_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(
        session_item.value->'exercises'
    ) AS exercise_item(value)
    WHERE EXISTS (
        SELECT 1
        FROM public.custom_exercises AS custom_exercise
        WHERE custom_exercise.user_id = v_recipient_user_id
          AND lower(btrim(custom_exercise.exercise_name)) =
              lower(btrim(exercise_item.value->>'name'))
    )
    OR EXISTS (
        SELECT 1
        FROM public.exercise_overrides AS exercise_override
        WHERE exercise_override.user_id = v_recipient_user_id
          AND lower(btrim(exercise_override.exercise_name)) =
              lower(btrim(exercise_item.value->>'name'))
    );

    SELECT COALESCE(
        array_agg(review_name ORDER BY review_name),
        ARRAY[]::TEXT[]
    )
    INTO v_review_exercises
    FROM (
        SELECT DISTINCT unnest(
            COALESCE(v_share.nonportable_exercises, ARRAY[]::TEXT[]) ||
            COALESCE(v_recipient_conflicts, ARRAY[]::TEXT[])
        ) AS review_name
    ) AS names;

    IF cardinality(v_review_exercises) > 0 THEN
        RAISE EXCEPTION 'share_review_required:%',
            to_jsonb(v_review_exercises)::TEXT
            USING ERRCODE = 'P0001';
    END IF;

    v_copied_split := public.create_split_full(v_share.snapshot);

    INSERT INTO public.split_share_copies(
        share_id,
        recipient_user_id,
        copied_split_id
    )
    VALUES (
        v_share.id,
        v_recipient_user_id,
        (v_copied_split->>'id')::UUID
    );

    RETURN v_copied_split;
END
$function$;

REVOKE ALL ON FUNCTION public.reject_split_share_updates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_split_share(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_split_share_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_split_shares(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_split_share(TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copy_split_share(TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_split_share(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_split_share_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_split_shares(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_split_share(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_split_share(TEXT) TO authenticated;
