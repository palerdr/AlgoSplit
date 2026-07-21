-- Backend audit advisor follow-up.
-- Keep recovery-token use storage backend-only while making the denial explicit,
-- and support its auth.users foreign key for deletes and integrity checks.

CREATE INDEX IF NOT EXISTS idx_auth_recovery_token_uses_user_id
    ON public.auth_recovery_token_uses(user_id);

DROP POLICY IF EXISTS auth_recovery_token_uses_backend_only
    ON public.auth_recovery_token_uses;
CREATE POLICY auth_recovery_token_uses_backend_only
    ON public.auth_recovery_token_uses
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

REVOKE ALL ON public.auth_recovery_token_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.auth_recovery_token_uses TO service_role;
