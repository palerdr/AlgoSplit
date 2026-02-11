-- Bodyweight tracking migration
-- Run this in the Supabase SQL Editor

-- 1. bodyweight_entries
CREATE TABLE IF NOT EXISTS bodyweight_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight numeric(6,2) NOT NULL CHECK (weight > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bodyweight_entries_user ON bodyweight_entries(user_id, recorded_at DESC);
ALTER TABLE bodyweight_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bodyweight entries" ON bodyweight_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
