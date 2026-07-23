-- Repair production schema drift where aggregate workout logging was deployed
-- without the historical idempotency column from migration 011.

ALTER TABLE public.workout_logs
    ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_logs_user_client_request
    ON public.workout_logs(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_exercises_log_order_unique
    ON public.workout_exercises(workout_log_id, order_index);

COMMENT ON COLUMN public.workout_logs.client_request_id IS
    'Stable client-generated key used to make workout creation idempotent';

-- Fail the migration rather than recording success with an unusable workout
-- RPC contract. This deliberately checks the catalog after the idempotent
-- repairs above so both legacy upgrades and clean bootstraps are covered.
DO $migration_contract$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workout_logs'
          AND column_name = 'client_request_id'
          AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'workout schema contract missing workout_logs.client_request_id';
    END IF;

    IF to_regclass('public.idx_workout_logs_user_client_request') IS NULL THEN
        RAISE EXCEPTION 'workout schema contract missing idempotency index';
    END IF;

    IF to_regclass('public.idx_workout_exercises_log_order_unique') IS NULL THEN
        RAISE EXCEPTION 'workout schema contract missing exercise order index';
    END IF;
END
$migration_contract$;
