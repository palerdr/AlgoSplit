-- Supabase projects can have direct default EXECUTE grants for anon and
-- authenticated. Revoking only PUBLIC does not remove those direct grants.

REVOKE ALL ON FUNCTION public.create_split_share(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_split_share_status(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_split_shares(UUID)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_split_share(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_split_share_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_split_shares(UUID) TO authenticated;
