-- Migration: Add cycle_length column to splits table
-- Run this in your Supabase SQL Editor

-- Add cycle_length column to splits table
ALTER TABLE splits
ADD COLUMN IF NOT EXISTS cycle_length integer DEFAULT NULL;

-- Add constraint to ensure valid cycle length (1-14 days)
ALTER TABLE splits
ADD CONSTRAINT check_cycle_length
CHECK (cycle_length IS NULL OR (cycle_length >= 1 AND cycle_length <= 14));

-- Comment for documentation
COMMENT ON COLUMN splits.cycle_length IS 'Cycle length in days (1-14). NULL means auto-calculate from max session day.';
