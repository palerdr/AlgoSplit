-- Migration 001: Create base tables for splits, sessions, and exercises
-- Run this in your Supabase SQL Editor or via migration tool

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create splits table
CREATE TABLE IF NOT EXISTS public.splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stimulus_duration INTEGER NOT NULL DEFAULT 48,
    maintenance_volume INTEGER NOT NULL DEFAULT 4,
    dataset TEXT NOT NULL DEFAULT 'average',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_stimulus_duration CHECK (stimulus_duration > 0),
    CONSTRAINT valid_maintenance_volume CHECK (maintenance_volume >= 0),
    CONSTRAINT valid_dataset CHECK (dataset IN ('schoenfeld', 'pelland', 'average'))
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    split_id UUID NOT NULL REFERENCES public.splits(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_day_number CHECK (day_number > 0)
);

-- Create exercises table
CREATE TABLE IF NOT EXISTS public.exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sets INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_sets CHECK (sets > 0),
    CONSTRAINT valid_order CHECK (order_index >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_splits_user_id ON public.splits(user_id);
CREATE INDEX IF NOT EXISTS idx_splits_created_at ON public.splits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_split_id ON public.sessions(split_id);
CREATE INDEX IF NOT EXISTS idx_sessions_split_day ON public.sessions(split_id, day_number);
CREATE INDEX IF NOT EXISTS idx_exercises_session_id ON public.exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_exercises_session_order ON public.exercises(session_id, order_index);

-- Add comments for documentation
COMMENT ON TABLE public.splits IS 'User-created training splits/programs';
COMMENT ON TABLE public.sessions IS 'Individual workout sessions within a split';
COMMENT ON TABLE public.exercises IS 'Exercise instances within sessions';
COMMENT ON COLUMN public.splits.stimulus_duration IS 'Hours of elevated protein synthesis (default 48h)';
COMMENT ON COLUMN public.splits.maintenance_volume IS 'Sets needed to maintain muscle (default 4)';
COMMENT ON COLUMN public.splits.dataset IS 'Fatigue curve to use: schoenfeld, pelland, or average';
