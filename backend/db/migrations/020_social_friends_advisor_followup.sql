-- Follow up on the Supabase advisors after deploying the social MVP.
--
-- 1. Cover the blocked_by foreign key for user deletion and block lookups.
-- 2. Replace the exposed SECURITY DEFINER username lookup bridge with a
--    SECURITY INVOKER RPC. The RPC sets transaction-local exact-match context
--    that the profiles RLS policy can inspect. Outside that one RPC
--    transaction, discoverable profiles remain non-listable.

CREATE INDEX friendships_blocked_by_idx
    ON public.friendships (blocked_by);

DROP POLICY "Profiles visible to owner and social counterpart"
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
            AND handle = (
                SELECT NULLIF(
                    CURRENT_SETTING('app.profile_lookup_handle', TRUE),
                    ''
                )
            )
        )
    );

CREATE OR REPLACE FUNCTION public.lookup_profile_by_handle(p_handle TEXT)
RETURNS TABLE (
    user_id UUID,
    handle TEXT,
    display_name TEXT,
    avatar_url TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    normalized_handle TEXT := LOWER(TRIM(p_handle));
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR normalized_handle !~ '^[a-z0-9_]{3,24}$' THEN
        RETURN;
    END IF;

    PERFORM SET_CONFIG(
        'app.profile_lookup_handle',
        normalized_handle,
        TRUE
    );

    RETURN QUERY
    SELECT p.user_id, p.handle, p.display_name, p.avatar_url
    FROM public.profiles p
    WHERE p.discoverable
      AND p.user_id <> (SELECT auth.uid())
      AND p.handle = normalized_handle
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_by_handle(TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_handle(TEXT)
    TO authenticated;

DROP FUNCTION private.lookup_profile_by_handle_exact(TEXT);
