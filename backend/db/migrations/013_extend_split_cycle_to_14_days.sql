-- Splits are no longer locked to a weekly cycle: the analysis engine has always
-- supported 1-14 day cycles (LCM simulation), and the API schemas now accept
-- day_number/cycle_length up to 14. Raise the save_split_session guard to match.
-- Apply before deploying the backend that allows 8-14 day splits.

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

    IF p_day_number < 1 OR p_day_number > 14 THEN
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
