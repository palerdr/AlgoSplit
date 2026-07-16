-- Durable mobile workout upload retries must not create duplicate logs.
ALTER TABLE public.workout_logs
    ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_logs_user_client_request
    ON public.workout_logs(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_exercises_log_order_unique
    ON public.workout_exercises(workout_log_id, order_index);

COMMENT ON COLUMN public.workout_logs.client_request_id IS
    'Stable client-generated key used to make workout creation idempotent';
