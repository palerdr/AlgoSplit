-- High-priority performance primitives for split editing and compact workout reads.
-- Apply before deploying the backend routes that call these functions.

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS unilateral BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS resistance_profile TEXT;

DO $$
DECLARE
    duplicate_split_ids TEXT;
BEGIN
    SELECT string_agg(DISTINCT split_id::TEXT, ', ' ORDER BY split_id::TEXT)
    INTO duplicate_split_ids
    FROM (
        SELECT split_id, day_number
        FROM public.sessions
        GROUP BY split_id, day_number
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_split_ids IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot add unique split-day index; duplicate day rows exist for split IDs: %',
            duplicate_split_ids;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_split_day_unique
    ON public.sessions(split_id, day_number);

CREATE OR REPLACE FUNCTION public.save_split_session(
    p_split_id UUID,
    p_session_id UUID,
    p_name TEXT,
    p_day_number INTEGER,
    p_exercises JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session public.sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.splits
        WHERE id = p_split_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'split_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_day_number < 1 OR p_day_number > 7 THEN
        RAISE EXCEPTION 'invalid_day_number' USING ERRCODE = '22023';
    END IF;

    IF p_session_id IS NULL THEN
        INSERT INTO public.sessions(split_id, name, day_number)
        VALUES (p_split_id, p_name, p_day_number)
        RETURNING * INTO v_session;
    ELSE
        UPDATE public.sessions
        SET name = p_name,
            day_number = p_day_number,
            updated_at = NOW()
        WHERE id = p_session_id AND split_id = p_split_id
        RETURNING * INTO v_session;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
        END IF;

        DELETE FROM public.exercises WHERE session_id = p_session_id;
    END IF;

    INSERT INTO public.exercises(
        session_id,
        exercise_name,
        sets,
        order_index,
        unilateral,
        resistance_profile
    )
    SELECT
        v_session.id,
        item.value->>'name',
        (item.value->>'sets')::INTEGER,
        item.ordinality - 1,
        COALESCE((item.value->>'unilateral')::BOOLEAN, false),
        NULLIF(item.value->>'resistance_profile', '')
    FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::JSONB))
        WITH ORDINALITY AS item(value, ordinality);

    RETURN jsonb_build_object(
        'id', v_session.id,
        'split_id', v_session.split_id,
        'name', v_session.name,
        'day_number', v_session.day_number,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at,
        'exercises', COALESCE((
            SELECT jsonb_agg(to_jsonb(e) ORDER BY e.order_index)
            FROM public.exercises e
            WHERE e.session_id = v_session.id
        ), '[]'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_split_full(
    p_split_id UUID,
    p_split JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_split public.splits%ROWTYPE;
    v_session JSONB;
    v_session_row public.sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    UPDATE public.splits
    SET name = p_split->>'name',
        cycle_length = NULLIF(p_split->>'cycle_length', '')::INTEGER,
        stimulus_duration = (p_split->>'stimulus_duration')::INTEGER,
        maintenance_volume = (p_split->>'maintenance_volume')::INTEGER,
        dataset = p_split->>'dataset',
        updated_at = NOW()
    WHERE id = p_split_id AND user_id = auth.uid()
    RETURNING * INTO v_split;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'split_not_found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.sessions WHERE split_id = p_split_id;

    FOR v_session IN
        SELECT value FROM jsonb_array_elements(COALESCE(p_split->'sessions', '[]'::JSONB))
    LOOP
        INSERT INTO public.sessions(split_id, name, day_number)
        VALUES (
            p_split_id,
            v_session->>'name',
            (v_session->>'day_number')::INTEGER
        )
        RETURNING * INTO v_session_row;

        INSERT INTO public.exercises(
            session_id,
            exercise_name,
            sets,
            order_index,
            unilateral,
            resistance_profile
        )
        SELECT
            v_session_row.id,
            item.value->>'name',
            (item.value->>'sets')::INTEGER,
            item.ordinality - 1,
            COALESCE((item.value->>'unilateral')::BOOLEAN, false),
            NULLIF(item.value->>'resistance_profile', '')
        FROM jsonb_array_elements(COALESCE(v_session->'exercises', '[]'::JSONB))
            WITH ORDINALITY AS item(value, ordinality);
    END LOOP;

    RETURN (
        SELECT jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'name', s.name,
            'cycle_length', s.cycle_length,
            'stimulus_duration', s.stimulus_duration,
            'maintenance_volume', s.maintenance_volume,
            'dataset', s.dataset,
            'created_at', s.created_at,
            'updated_at', s.updated_at,
            'sessions', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ss.id,
                        'split_id', ss.split_id,
                        'name', ss.name,
                        'day_number', ss.day_number,
                        'created_at', ss.created_at,
                        'updated_at', ss.updated_at,
                        'exercises', COALESCE((
                            SELECT jsonb_agg(to_jsonb(e) ORDER BY e.order_index)
                            FROM public.exercises e
                            WHERE e.session_id = ss.id
                        ), '[]'::JSONB)
                    ) ORDER BY ss.day_number
                )
                FROM public.sessions ss
                WHERE ss.split_id = s.id
            ), '[]'::JSONB)
        )
        FROM public.splits s
        WHERE s.id = p_split_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workout_overview(p_days INTEGER DEFAULT 180)
RETURNS TABLE(
    id UUID,
    completed_at TIMESTAMPTZ,
    total_sets BIGINT,
    total_volume NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT
        wl.id,
        wl.completed_at,
        COUNT(paired.ordinality)::BIGINT AS total_sets,
        COALESCE(SUM(paired.reps * paired.weight), 0)::NUMERIC AS total_volume
    FROM public.workout_logs wl
    LEFT JOIN public.workout_exercises we ON we.workout_log_id = wl.id
    LEFT JOIN LATERAL (
        SELECT
            reps.ordinality,
            reps.value::NUMERIC AS reps,
            weights.value::NUMERIC AS weight
        FROM jsonb_array_elements_text(COALESCE(we.reps, '[]'::JSONB))
            WITH ORDINALITY AS reps(value, ordinality)
        JOIN jsonb_array_elements_text(COALESCE(we.weight, '[]'::JSONB))
            WITH ORDINALITY AS weights(value, ordinality)
            USING (ordinality)
    ) paired ON true
    WHERE wl.user_id = auth.uid()
      AND (p_days IS NULL OR wl.completed_at >= NOW() - make_interval(days => p_days))
    GROUP BY wl.id, wl.completed_at
    ORDER BY wl.completed_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_workout_progress(
    p_exercise_name TEXT,
    p_days INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    workout_id UUID,
    completed_at TIMESTAMPTZ,
    session_name TEXT,
    exercise_name TEXT,
    reps JSONB,
    weight JSONB,
    rir JSONB,
    order_index INTEGER,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    WITH matching_workouts AS (
        SELECT DISTINCT wl.id, wl.completed_at, wl.session_name
        FROM public.workout_logs wl
        JOIN public.workout_exercises we ON we.workout_log_id = wl.id
        WHERE wl.user_id = auth.uid()
          AND lower(trim(we.exercise_name)) = lower(trim(p_exercise_name))
          AND (p_days IS NULL OR wl.completed_at >= NOW() - make_interval(days => p_days))
    ), paged AS (
        SELECT *, COUNT(*) OVER() AS total_count
        FROM matching_workouts
        ORDER BY completed_at ASC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT
        p.id,
        p.completed_at,
        p.session_name,
        we.exercise_name,
        we.reps,
        we.weight,
        we.rir,
        we.order_index,
        p.total_count
    FROM paged p
    JOIN public.workout_exercises we ON we.workout_log_id = p.id
    WHERE lower(trim(we.exercise_name)) = lower(trim(p_exercise_name))
    ORDER BY p.completed_at ASC, we.order_index;
$$;

REVOKE ALL ON FUNCTION public.save_split_session(UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_split_full(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_workout_overview(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_workout_progress(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_split_session(UUID, UUID, TEXT, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_split_full(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workout_overview(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workout_progress(TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
