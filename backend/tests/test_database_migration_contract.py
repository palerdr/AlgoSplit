from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = BACKEND_DIR / "db" / "migrations"
BOOTSTRAP = BACKEND_DIR / "db" / "bootstrap" / "000_splitai_baseline.sql"


def test_workout_idempotency_repair_is_in_clean_bootstrap_order():
    bootstrap = BOOTSTRAP.read_text()

    snapshot_position = bootstrap.index("016_durable_analysis_snapshots.sql")
    repair_position = bootstrap.index("017_repair_workout_idempotency_schema.sql")

    assert snapshot_position < repair_position


def test_workout_idempotency_repair_defines_and_verifies_rpc_dependencies():
    migration = (
        MIGRATIONS_DIR / "017_repair_workout_idempotency_schema.sql"
    ).read_text()

    assert "ADD COLUMN IF NOT EXISTS client_request_id TEXT" in migration
    assert "CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_logs_user_client_request" in migration
    assert "CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_exercises_log_order_unique" in migration
    assert "workout schema contract missing workout_logs.client_request_id" in migration


def test_split_sharing_migration_is_additive_and_immutable():
    bootstrap = BOOTSTRAP.read_text()
    migration_name = "018_split_shares.sql"
    migration = (MIGRATIONS_DIR / migration_name).read_text()

    assert bootstrap.index(
        "017_repair_workout_idempotency_schema.sql"
    ) < bootstrap.index(migration_name)
    assert "CREATE TABLE IF NOT EXISTS public.split_shares" in migration
    assert "token_hash TEXT NOT NULL UNIQUE" in migration
    assert "snapshot JSONB NOT NULL" in migration
    assert "nonportable_exercises TEXT[] NOT NULL" in migration
    assert "octet_length(snapshot::TEXT) <= 65536" in migration
    assert "CREATE POLICY split_shares_owner_insert" in migration
    assert "owned_split.user_id = (SELECT auth.uid())" in migration
    assert "BEFORE UPDATE ON public.split_shares" in migration
    assert "CREATE TABLE IF NOT EXISTS public.split_share_copies" in migration
    assert "PRIMARY KEY (share_id, recipient_user_id)" in migration
    assert "REVOKE ALL ON public.split_share_copies FROM PUBLIC, anon, authenticated" in migration
    assert "REVOKE ALL ON public.split_shares FROM PUBLIC, anon, authenticated" in migration
    assert "DELETE FROM public.split_shares AS share" in migration
    assert "DELETE FROM public.split_shares AS expired_share" in migration
    assert "pg_catalog.pg_advisory_xact_lock" in migration
    assert "pg_catalog.hashtextextended('split_shares:' || v_user_id::TEXT, 0)" in migration
    assert "v_total_active_count >= 20 OR v_active_count >= 5" in migration
    assert "maintenance_volume')::INTEGER NOT BETWEEN 1 AND 9" in migration
    assert "GRANT EXECUTE ON FUNCTION public.get_public_split_share(TEXT) TO service_role" in migration
    assert "CREATE OR REPLACE FUNCTION public.copy_split_share" in migration
    assert "'split_share_copy:' || v_recipient_user_id::TEXT" in migration
    assert "FOR KEY SHARE" in migration
    assert "v_copied_split := public.create_split_full(v_share.snapshot)" in migration
    assert "share_review_required:%" in migration
    assert migration.count(
        "lower(btrim(custom_exercise.exercise_name))"
    ) == 2
    assert migration.count(
        "lower(btrim(exercise_override.exercise_name))"
    ) == 2
    assert "GRANT EXECUTE ON FUNCTION public.copy_split_share(TEXT) TO authenticated" in migration
    assert "GRANT EXECUTE ON FUNCTION public.get_public_split_share(TEXT) TO anon" not in migration
    assert "GRANT SELECT ON public.split_shares TO anon" not in migration


def test_social_migration_is_in_clean_bootstrap_order():
    bootstrap = BOOTSTRAP.read_text()
    public_share_position = bootstrap.index("018_split_shares.sql")
    social_position = bootstrap.index("019_social_friends_mvp.sql")
    advisor_position = bootstrap.index("020_social_friends_advisor_followup.sql")
    privilege_position = bootstrap.index("021_social_friends_privilege_hardening.sql")
    reconcile_position = bootstrap.index("022_reconcile_social_split_share_name.sql")
    function_privilege_position = bootstrap.index(
        "023_split_share_function_privilege_hardening.sql"
    )
    assert (
        public_share_position
        < social_position
        < advisor_position
        < privilege_position
        < reconcile_position
        < function_privilege_position
    )


def test_social_publications_are_rls_protected_and_do_not_read_raw_workouts():
    migration = (MIGRATIONS_DIR / "019_social_friends_mvp.sql").read_text()

    for table in [
        "profiles",
        "friendships",
        "friend_visibility_settings",
        "social_stimulus_snapshots",
        "social_weekly_activity_cards",
        "social_lift_trends",
        "social_split_shares",
    ]:
        assert f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in migration

    assert "FROM public.analysis_snapshots" not in migration
    assert "FROM public.workout_logs" not in migration
    assert "FROM public.workout_exercises" not in migration
    assert "published split versions are immutable" in migration
    assert "lookup_profile_by_handle_exact" in migration
    assert "REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated" in migration


def test_social_followups_remove_exposed_definer_and_legacy_broad_grants():
    advisor = (
        MIGRATIONS_DIR / "020_social_friends_advisor_followup.sql"
    ).read_text()
    privileges = (
        MIGRATIONS_DIR / "021_social_friends_privilege_hardening.sql"
    ).read_text()

    assert "SECURITY INVOKER" in advisor
    assert "DROP FUNCTION private.lookup_profile_by_handle_exact(TEXT)" in advisor
    assert "CREATE INDEX friendships_blocked_by_idx" in advisor
    assert "REVOKE ALL PRIVILEGES ON TABLE public.profiles" in privileges
    assert "FROM anon, authenticated" in privileges
    assert "GRANT SELECT, INSERT, DELETE" in privileges
    assert "TRUNCATE" not in privileges.split("GRANT", 1)[1]


def test_social_split_share_reconciliation_is_narrow_and_idempotent():
    migration = (
        MIGRATIONS_DIR / "022_reconcile_social_split_share_name.sql"
    ).read_text()

    assert "to_regclass('public.social_split_shares') IS NULL" in migration
    assert "column_name = 'split_version'" in migration
    assert "column_name = 'token_hash'" in migration
    assert "ALTER TABLE public.split_shares RENAME TO social_split_shares" in migration
    assert "RENAME CONSTRAINT split_shares_pkey TO social_split_shares_pkey" in migration


def test_split_share_owner_rpcs_revoke_direct_anon_execute():
    clean_install = (MIGRATIONS_DIR / "018_split_shares.sql").read_text()
    hardening = (
        MIGRATIONS_DIR / "023_split_share_function_privilege_hardening.sql"
    ).read_text()

    for function_signature in [
        "public.create_split_share(UUID, TEXT)",
        "public.get_split_share_status(UUID)",
        "public.revoke_split_shares(UUID)",
    ]:
        assert function_signature in clean_install
        assert function_signature in hardening

    assert hardening.count("FROM PUBLIC, anon, authenticated") == 3
    assert hardening.count("TO authenticated") == 3
