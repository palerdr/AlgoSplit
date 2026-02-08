-- Migration 008: Create comparisons table for split comparison feature
-- Run this in the Supabase SQL Editor

CREATE TABLE comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    split_ids UUID[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX idx_comparisons_user_id ON comparisons(user_id);

-- Enable RLS
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only manage their own comparisons
CREATE POLICY "Users can manage own comparisons"
    ON comparisons FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER update_comparisons_updated_at
    BEFORE UPDATE ON comparisons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
