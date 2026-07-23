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
