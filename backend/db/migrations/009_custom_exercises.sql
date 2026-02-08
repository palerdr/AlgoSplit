-- Migration: Add custom_exercises table for user-defined exercises
-- Users can define exercises with custom muscle targeting weights

-- Create custom_exercises table
CREATE TABLE IF NOT EXISTS custom_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,

    -- Tiered muscle targets (muscle_id -> weight)
    prime_targets JSONB NOT NULL DEFAULT '{}',
    secondary_targets JSONB NOT NULL DEFAULT '{}',
    tertiary_targets JSONB NOT NULL DEFAULT '{}',
    quaternary_targets JSONB NOT NULL DEFAULT '{}',

    -- Exercise properties
    axial_load DECIMAL(3,2) NOT NULL DEFAULT 0.0 CHECK (axial_load >= 0 AND axial_load <= 1),
    resistance_profile TEXT NOT NULL DEFAULT 'mid' CHECK (resistance_profile IN ('ascending', 'mid', 'descending')),
    is_bilateral BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one custom exercise name per user
    CONSTRAINT unique_user_exercise UNIQUE (user_id, exercise_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_exercises_user_id ON custom_exercises(user_id);

-- Enable RLS
ALTER TABLE custom_exercises ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own custom exercises
CREATE POLICY "Users can view own custom exercises"
    ON custom_exercises FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own custom exercises"
    ON custom_exercises FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom exercises"
    ON custom_exercises FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom exercises"
    ON custom_exercises FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_custom_exercises_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_custom_exercises_updated_at
    BEFORE UPDATE ON custom_exercises
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_exercises_updated_at();
