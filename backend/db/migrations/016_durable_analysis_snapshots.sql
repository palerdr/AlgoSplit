-- Durable per-user workout analysis cache. The composite primary key matches
-- every request parameter that can change the response, so a warm app open is
-- one indexed row read instead of workout/exercise fan-out plus simulation.

CREATE TABLE IF NOT EXISTS public.analysis_snapshots (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    days SMALLINT NOT NULL CHECK (days BETWEEN 1 AND 90),
    end_date DATE NOT NULL,
    timezone_offset_minutes SMALLINT NOT NULL
        CHECK (timezone_offset_minutes BETWEEN -840 AND 840),
    stimulus_duration SMALLINT NOT NULL
        CHECK (stimulus_duration BETWEEN 24 AND 96),
    maintenance_volume SMALLINT NOT NULL
        CHECK (maintenance_volume BETWEEN 1 AND 9),
    dataset TEXT NOT NULL
        CHECK (dataset IN ('schoenfeld', 'pelland', 'average')),
    response JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (
        user_id,
        days,
        end_date,
        timezone_offset_minutes,
        stimulus_duration,
        maintenance_volume,
        dataset
    )
);

ALTER TABLE public.analysis_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own analysis snapshots"
    ON public.analysis_snapshots;
CREATE POLICY "Users read own analysis snapshots"
    ON public.analysis_snapshots
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users create own analysis snapshots"
    ON public.analysis_snapshots;
CREATE POLICY "Users create own analysis snapshots"
    ON public.analysis_snapshots
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own analysis snapshots"
    ON public.analysis_snapshots;
CREATE POLICY "Users update own analysis snapshots"
    ON public.analysis_snapshots
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- New Supabase projects can opt out of automatic Data API exposure. Grant the
-- authenticated role explicitly; RLS remains the row-level authorization gate.
GRANT SELECT, INSERT, UPDATE ON public.analysis_snapshots TO authenticated;
