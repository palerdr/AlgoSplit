-- Migration 002: Create workout logging tables
-- Run this after 001_create_base_tables.sql

-- Create workout_logs table
CREATE TABLE IF NOT EXISTS public.workout_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    split_id UUID REFERENCES public.splits(id) ON DELETE SET NULL,
    session_name TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_minutes INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

-- Create workout_exercises table
CREATE TABLE IF NOT EXISTS public.workout_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_log_id UUID NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sets_completed INTEGER NOT NULL,
    reps JSONB NOT NULL DEFAULT '[]'::jsonb,
    weight JSONB NOT NULL DEFAULT '[]'::jsonb,
    order_index INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_sets_completed CHECK (sets_completed > 0),
    CONSTRAINT valid_order CHECK (order_index >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON public.workout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_completed_at ON public.workout_logs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_logs_session_id ON public.workout_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_split_id ON public.workout_logs(split_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_completed ON public.workout_logs(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_log_id ON public.workout_exercises(workout_log_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_order ON public.workout_exercises(workout_log_id, order_index);

-- Add comments for documentation
COMMENT ON TABLE public.workout_logs IS 'Completed workout sessions (actual workouts performed)';
COMMENT ON TABLE public.workout_exercises IS 'Individual exercises performed within a logged workout';
COMMENT ON COLUMN public.workout_logs.session_id IS 'Optional reference to planned session';
COMMENT ON COLUMN public.workout_logs.split_id IS 'Optional reference to split being followed';
COMMENT ON COLUMN public.workout_exercises.reps IS 'Array of reps per set, e.g., [8, 8, 7, 6]';
COMMENT ON COLUMN public.workout_exercises.weight IS 'Array of weights per set, e.g., [185, 185, 185, 185]';
