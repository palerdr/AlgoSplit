-- Migration 005: Create triggers for automatic timestamp updates
-- Run this after 004_setup_rls_policies.sql

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for splits table
DROP TRIGGER IF EXISTS update_splits_updated_at ON public.splits;
CREATE TRIGGER update_splits_updated_at
    BEFORE UPDATE ON public.splits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for sessions table
DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for exercise_overrides table
DROP TRIGGER IF EXISTS update_exercise_overrides_updated_at ON public.exercise_overrides;
CREATE TRIGGER update_exercise_overrides_updated_at
    BEFORE UPDATE ON public.exercise_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Automatically updates the updated_at column to the current timestamp';
