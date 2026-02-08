-- Migration 004: Set up Row Level Security (RLS) policies
-- Run this after 003_create_exercise_overrides.sql

-- Enable Row Level Security on all tables
ALTER TABLE public.splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_overrides ENABLE ROW LEVEL SECURITY;

-- ========================================
-- SPLITS TABLE POLICIES
-- ========================================

-- Policy: Users can view their own splits
CREATE POLICY "Users can view their own splits"
    ON public.splits
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own splits
CREATE POLICY "Users can insert their own splits"
    ON public.splits
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own splits
CREATE POLICY "Users can update their own splits"
    ON public.splits
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own splits
CREATE POLICY "Users can delete their own splits"
    ON public.splits
    FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- SESSIONS TABLE POLICIES
-- ========================================

-- Policy: Users can view sessions from their own splits
CREATE POLICY "Users can view sessions from their own splits"
    ON public.sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.splits
            WHERE splits.id = sessions.split_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can insert sessions into their own splits
CREATE POLICY "Users can insert sessions into their own splits"
    ON public.sessions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.splits
            WHERE splits.id = split_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can update sessions in their own splits
CREATE POLICY "Users can update sessions in their own splits"
    ON public.sessions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.splits
            WHERE splits.id = sessions.split_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can delete sessions from their own splits
CREATE POLICY "Users can delete sessions from their own splits"
    ON public.sessions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.splits
            WHERE splits.id = sessions.split_id
            AND splits.user_id = auth.uid()
        )
    );

-- ========================================
-- EXERCISES TABLE POLICIES
-- ========================================

-- Policy: Users can view exercises from their own sessions
CREATE POLICY "Users can view exercises from their own sessions"
    ON public.exercises
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            JOIN public.splits ON splits.id = sessions.split_id
            WHERE sessions.id = exercises.session_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can insert exercises into their own sessions
CREATE POLICY "Users can insert exercises into their own sessions"
    ON public.exercises
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            JOIN public.splits ON splits.id = sessions.split_id
            WHERE sessions.id = session_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can update exercises in their own sessions
CREATE POLICY "Users can update exercises in their own sessions"
    ON public.exercises
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            JOIN public.splits ON splits.id = sessions.split_id
            WHERE sessions.id = exercises.session_id
            AND splits.user_id = auth.uid()
        )
    );

-- Policy: Users can delete exercises from their own sessions
CREATE POLICY "Users can delete exercises from their own sessions"
    ON public.exercises
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            JOIN public.splits ON splits.id = sessions.split_id
            WHERE sessions.id = exercises.session_id
            AND splits.user_id = auth.uid()
        )
    );

-- ========================================
-- WORKOUT_LOGS TABLE POLICIES
-- ========================================

-- Policy: Users can view their own workout logs
CREATE POLICY "Users can view their own workout logs"
    ON public.workout_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own workout logs
CREATE POLICY "Users can insert their own workout logs"
    ON public.workout_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own workout logs
CREATE POLICY "Users can update their own workout logs"
    ON public.workout_logs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own workout logs
CREATE POLICY "Users can delete their own workout logs"
    ON public.workout_logs
    FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- WORKOUT_EXERCISES TABLE POLICIES
-- ========================================

-- Policy: Users can view exercises from their own workout logs
CREATE POLICY "Users can view exercises from their own workout logs"
    ON public.workout_exercises
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_logs
            WHERE workout_logs.id = workout_exercises.workout_log_id
            AND workout_logs.user_id = auth.uid()
        )
    );

-- Policy: Users can insert exercises into their own workout logs
CREATE POLICY "Users can insert exercises into their own workout logs"
    ON public.workout_exercises
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workout_logs
            WHERE workout_logs.id = workout_log_id
            AND workout_logs.user_id = auth.uid()
        )
    );

-- Policy: Users can update exercises in their own workout logs
CREATE POLICY "Users can update exercises in their own workout logs"
    ON public.workout_exercises
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_logs
            WHERE workout_logs.id = workout_exercises.workout_log_id
            AND workout_logs.user_id = auth.uid()
        )
    );

-- Policy: Users can delete exercises from their own workout logs
CREATE POLICY "Users can delete exercises from their own workout logs"
    ON public.workout_exercises
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_logs
            WHERE workout_logs.id = workout_exercises.workout_log_id
            AND workout_logs.user_id = auth.uid()
        )
    );

-- ========================================
-- EXERCISE_OVERRIDES TABLE POLICIES
-- ========================================

-- Policy: Users can view their own exercise overrides
CREATE POLICY "Users can view their own exercise overrides"
    ON public.exercise_overrides
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own exercise overrides
CREATE POLICY "Users can insert their own exercise overrides"
    ON public.exercise_overrides
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own exercise overrides
CREATE POLICY "Users can update their own exercise overrides"
    ON public.exercise_overrides
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own exercise overrides
CREATE POLICY "Users can delete their own exercise overrides"
    ON public.exercise_overrides
    FOR DELETE
    USING (auth.uid() = user_id);
