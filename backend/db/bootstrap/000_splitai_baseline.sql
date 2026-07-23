-- Clean database bootstrap. Run with psql so \ir resolves each historical file.
-- Existing projects must apply only the next additive migration, never this file.
\set ON_ERROR_STOP on
\ir ../migrations/001_create_base_tables.sql
\ir ../migrations/002_create_workout_tables.sql
\ir ../migrations/002_bodyweight.sql
\ir ../migrations/001_programs.sql
\ir ../migrations/003_create_exercise_overrides.sql
\ir ../migrations/004_setup_rls_policies.sql
\ir ../migrations/005_create_triggers.sql
\ir ../migrations/008_add_cycle_length.sql
\ir ../migrations/008_create_comparisons.sql
\ir ../migrations/009_custom_exercises.sql
\ir ../migrations/010_add_rir_column.sql
\ir ../migrations/011_workout_idempotency.sql
\ir ../migrations/012_performance_rpcs.sql
\ir ../migrations/013_extend_split_cycle_to_14_days.sql
\ir ../migrations/014_backend_audit_repair.sql
\ir ../migrations/015_backend_audit_advisor_followup.sql
\ir ../migrations/016_durable_analysis_snapshots.sql
\ir ../migrations/017_repair_workout_idempotency_schema.sql
\ir ../migrations/018_split_shares.sql
