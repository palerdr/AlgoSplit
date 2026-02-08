-- Migration 003: Create exercise overrides table
-- Run this after 002_create_workout_tables.sql

-- Create exercise_overrides table
CREATE TABLE IF NOT EXISTS public.exercise_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    pattern_override TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_user_exercise UNIQUE (user_id, exercise_name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exercise_overrides_user_id ON public.exercise_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_overrides_user_exercise ON public.exercise_overrides(user_id, exercise_name);

-- Add comments for documentation
COMMENT ON TABLE public.exercise_overrides IS 'User corrections for exercise classification';
COMMENT ON COLUMN public.exercise_overrides.exercise_name IS 'Original exercise name to override';
COMMENT ON COLUMN public.exercise_overrides.pattern_override IS 'Correct movement pattern to use';
