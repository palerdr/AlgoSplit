-- Reconcile projects that received the social MVP before the link-sharing
-- migration landed on main. Those projects temporarily used split_shares for
-- friend-scoped immutable versions; current installs reserve that name for
-- opaque-token link shares and use social_split_shares for friend sharing.

DO $$
BEGIN
    IF to_regclass('public.social_split_shares') IS NULL
       AND to_regclass('public.split_shares') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'split_shares'
             AND column_name = 'split_version'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'split_shares'
             AND column_name = 'token_hash'
       )
    THEN
        ALTER TABLE public.split_shares RENAME TO social_split_shares;

        IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.social_split_shares'::regclass
              AND conname = 'split_shares_pkey'
        )
        THEN
            ALTER TABLE public.social_split_shares
                RENAME CONSTRAINT split_shares_pkey TO social_split_shares_pkey;
        END IF;
    END IF;
END
$$;

COMMENT ON TABLE public.social_split_shares IS
    'Immutable friend-scoped split and analysis versions; revocation removes recipient access.';
