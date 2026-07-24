-- Supabase projects created before granular Data API defaults may grant broad
-- table privileges automatically. RLS does not apply to TRUNCATE, so revoke
-- inherited defaults and explicitly grant only the operations used by the
-- social API.

REVOKE ALL PRIVILEGES ON TABLE public.profiles
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.friendships
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.friend_visibility_settings
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.social_stimulus_snapshots
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.social_weekly_activity_cards
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.social_lift_trends
    FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.social_split_shares
    FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE
    ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE
    ON public.friend_visibility_settings TO authenticated;
GRANT SELECT, INSERT, DELETE
    ON public.social_stimulus_snapshots TO authenticated;
GRANT SELECT, INSERT, DELETE
    ON public.social_weekly_activity_cards TO authenticated;
GRANT SELECT, INSERT, DELETE
    ON public.social_lift_trends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.social_split_shares TO authenticated;

-- Keep the transaction-local lookup setting as an initialization plan value
-- rather than evaluating current_setting() for every candidate profile row.
DROP POLICY "Profiles visible to owner social counterpart or exact lookup"
    ON public.profiles;

CREATE POLICY "Profiles visible to owner social counterpart or exact lookup"
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
        OR (
            discoverable
            AND user_id <> (SELECT auth.uid())
            AND handle = NULLIF(
                (SELECT CURRENT_SETTING(
                    'app.profile_lookup_handle',
                    TRUE
                )),
                ''
            )
        )
    );
