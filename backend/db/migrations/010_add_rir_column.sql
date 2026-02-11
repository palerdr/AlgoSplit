-- Migration 010: Add RIR (Reps In Reserve) column to workout_exercises
-- RIR is stored as a JSONB array matching the sets array, e.g. [2, 3, 2]
-- Non-breaking change: existing workouts will have rir = NULL
-- The API allows rir to be optional on both create and update operations

ALTER TABLE public.workout_exercises
ADD COLUMN IF NOT EXISTS rir JSONB DEFAULT NULL;
