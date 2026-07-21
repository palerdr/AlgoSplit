-- Backend audit repair: missing template schema, atomic aggregate writes,
-- workout idempotency, and recovery-token replay protection.

CREATE TABLE IF NOT EXISTS public.meso_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    focus TEXT,
    progression_type TEXT CHECK (progression_type IN ('linear', 'undulating', 'block', 'custom')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meso_template_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.meso_templates(id) ON DELETE CASCADE,
    week_index INTEGER NOT NULL,
    deload BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(template_id, week_index)
);
CREATE TABLE IF NOT EXISTS public.meso_template_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id UUID NOT NULL REFERENCES public.meso_template_weeks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meso_template_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.meso_template_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sets INTEGER NOT NULL CHECK (sets > 0),
    order_index INTEGER NOT NULL DEFAULT 0,
    unilateral BOOLEAN NOT NULL DEFAULT false,
    resistance_profile TEXT CHECK (resistance_profile IN ('ascending', 'mid', 'descending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meso_templates_user ON public.meso_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_meso_template_weeks_template ON public.meso_template_weeks(template_id, week_index);
CREATE INDEX IF NOT EXISTS idx_meso_template_sessions_week ON public.meso_template_sessions(week_id, order_index);
CREATE INDEX IF NOT EXISTS idx_meso_template_exercises_session ON public.meso_template_exercises(session_id, order_index);

ALTER TABLE public.meso_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meso_template_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meso_template_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meso_template_exercises ENABLE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE item RECORD;
BEGIN
    FOR item IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('meso_templates', 'meso_template_weeks', 'meso_template_sessions', 'meso_template_exercises')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
    END LOOP;
END
$policy_cleanup$;

CREATE POLICY meso_templates_owner ON public.meso_templates
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY meso_template_weeks_owner ON public.meso_template_weeks
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meso_templates mt
        WHERE mt.id = template_id AND mt.user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meso_templates mt
        WHERE mt.id = template_id AND mt.user_id = (SELECT auth.uid())
    ));
CREATE POLICY meso_template_sessions_owner ON public.meso_template_sessions
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meso_template_weeks mw
        JOIN public.meso_templates mt ON mt.id = mw.template_id
        WHERE mw.id = week_id AND mt.user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meso_template_weeks mw
        JOIN public.meso_templates mt ON mt.id = mw.template_id
        WHERE mw.id = week_id AND mt.user_id = (SELECT auth.uid())
    ));
CREATE POLICY meso_template_exercises_owner ON public.meso_template_exercises
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meso_template_sessions ms
        JOIN public.meso_template_weeks mw ON mw.id = ms.week_id
        JOIN public.meso_templates mt ON mt.id = mw.template_id
        WHERE ms.id = session_id AND mt.user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meso_template_sessions ms
        JOIN public.meso_template_weeks mw ON mw.id = ms.week_id
        JOIN public.meso_templates mt ON mt.id = mw.template_id
        WHERE ms.id = session_id AND mt.user_id = (SELECT auth.uid())
    ));

REVOKE ALL ON public.meso_templates, public.meso_template_weeks,
    public.meso_template_sessions, public.meso_template_exercises FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meso_templates,
    public.meso_template_weeks, public.meso_template_sessions,
    public.meso_template_exercises TO authenticated;

CREATE TABLE IF NOT EXISTS public.auth_recovery_token_uses (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_recovery_token_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_recovery_token_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.auth_recovery_token_uses TO service_role;
CREATE INDEX IF NOT EXISTS idx_auth_recovery_token_uses_expiry
    ON public.auth_recovery_token_uses(expires_at);

ALTER TABLE public.workout_logs
    ADD COLUMN IF NOT EXISTS request_hash TEXT,
    ADD COLUMN IF NOT EXISTS program_session_id UUID REFERENCES public.program_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_session
    ON public.workout_logs(program_session_id);

CREATE OR REPLACE FUNCTION public.create_split_full(p_split JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_split public.splits%ROWTYPE;
    v_session JSONB;
    v_session_row public.sessions%ROWTYPE;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.splits(user_id, name, cycle_length, stimulus_duration, maintenance_volume, dataset)
    VALUES (
        (SELECT auth.uid()), p_split->>'name',
        NULLIF(p_split->>'cycle_length', '')::INTEGER,
        (p_split->>'stimulus_duration')::INTEGER,
        (p_split->>'maintenance_volume')::INTEGER,
        p_split->>'dataset'
    ) RETURNING * INTO v_split;

    FOR v_session IN SELECT value FROM jsonb_array_elements(COALESCE(p_split->'sessions', '[]'::JSONB))
    LOOP
        INSERT INTO public.sessions(split_id, name, day_number)
        VALUES (v_split.id, v_session->>'name', (v_session->>'day_number')::INTEGER)
        RETURNING * INTO v_session_row;
        INSERT INTO public.exercises(session_id, exercise_name, sets, order_index, unilateral, resistance_profile)
        SELECT v_session_row.id, item.value->>'name', (item.value->>'sets')::INTEGER,
            item.ordinality - 1, COALESCE((item.value->>'unilateral')::BOOLEAN, false),
            NULLIF(item.value->>'resistance_profile', '')
        FROM jsonb_array_elements(COALESCE(v_session->'exercises', '[]'::JSONB))
            WITH ORDINALITY AS item(value, ordinality);
    END LOOP;

    RETURN (
        SELECT jsonb_build_object(
            'id', s.id, 'user_id', s.user_id, 'name', s.name,
            'cycle_length', s.cycle_length, 'stimulus_duration', s.stimulus_duration,
            'maintenance_volume', s.maintenance_volume, 'dataset', s.dataset,
            'created_at', s.created_at, 'updated_at', s.updated_at,
            'sessions', COALESCE((SELECT jsonb_agg(
                jsonb_build_object(
                    'id', ss.id, 'split_id', ss.split_id, 'name', ss.name,
                    'day_number', ss.day_number, 'created_at', ss.created_at,
                    'updated_at', ss.updated_at,
                    'exercises', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.order_index)
                        FROM public.exercises e WHERE e.session_id = ss.id), '[]'::JSONB)
                ) ORDER BY ss.day_number)
                FROM public.sessions ss WHERE ss.split_id = s.id), '[]'::JSONB)
        ) FROM public.splits s WHERE s.id = v_split.id
    );
END
$function$;

CREATE OR REPLACE FUNCTION public.log_workout_full(p_workout JSONB, p_request_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_log public.workout_logs%ROWTYPE;
    v_existing public.workout_logs%ROWTYPE;
    v_session_id UUID;
    v_program_session_id UUID;
    v_requested_session UUID := NULLIF(p_workout->>'session_id', '')::UUID;
    v_requested_program_session UUID := NULLIF(p_workout->>'program_session_id', '')::UUID;
    v_client_request_id TEXT := NULLIF(p_workout->>'client_request_id', '');
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    IF v_client_request_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.workout_logs
        WHERE user_id = (SELECT auth.uid()) AND client_request_id = v_client_request_id;
        IF FOUND THEN
            IF v_existing.request_hash IS NOT NULL AND v_existing.request_hash <> p_request_hash THEN
                RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22000';
            END IF;
            v_log := v_existing;
        END IF;
    END IF;

    IF v_log.id IS NULL THEN
        SELECT se.id INTO v_session_id
        FROM public.sessions se JOIN public.splits sp ON sp.id = se.split_id
        WHERE se.id = v_requested_session AND sp.user_id = (SELECT auth.uid());

        SELECT ps.id INTO v_program_session_id
        FROM public.program_sessions ps JOIN public.programs p ON p.id = ps.program_id
        WHERE ps.id = v_requested_program_session AND p.user_id = (SELECT auth.uid())
          AND ps.status = 'planned' AND ps.workout_log_id IS NULL;

        BEGIN
            INSERT INTO public.workout_logs(
                user_id, session_id, split_id, program_session_id, session_name,
                completed_at, duration_minutes, notes, client_request_id, request_hash
            ) VALUES (
                (SELECT auth.uid()), v_session_id,
                CASE WHEN EXISTS (SELECT 1 FROM public.splits s WHERE s.id = NULLIF(p_workout->>'split_id', '')::UUID AND s.user_id = (SELECT auth.uid()))
                    THEN NULLIF(p_workout->>'split_id', '')::UUID ELSE NULL END,
                v_program_session_id, p_workout->>'session_name',
                COALESCE(NULLIF(p_workout->>'completed_at', '')::TIMESTAMPTZ, now()),
                NULLIF(p_workout->>'duration_minutes', '')::INTEGER,
                NULLIF(p_workout->>'notes', ''), v_client_request_id, p_request_hash
            ) RETURNING * INTO v_log;
        EXCEPTION WHEN unique_violation THEN
            SELECT * INTO v_existing FROM public.workout_logs
            WHERE user_id = (SELECT auth.uid()) AND client_request_id = v_client_request_id;
            IF NOT FOUND OR (v_existing.request_hash IS NOT NULL AND v_existing.request_hash <> p_request_hash) THEN
                RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22000';
            END IF;
            v_log := v_existing;
        END;

        IF NOT EXISTS (SELECT 1 FROM public.workout_exercises we WHERE we.workout_log_id = v_log.id) THEN
            INSERT INTO public.workout_exercises(
                workout_log_id, exercise_name, sets_completed, reps, weight,
                rir, order_index, notes
            )
            SELECT v_log.id, item.value->>'exercise_name',
                (item.value->>'sets_completed')::INTEGER,
                COALESCE(item.value->'reps', '[]'::JSONB),
                COALESCE(item.value->'weight', '[]'::JSONB),
                item.value->'rir', item.ordinality - 1, NULLIF(item.value->>'notes', '')
            FROM jsonb_array_elements(COALESCE(p_workout->'exercises', '[]'::JSONB))
                WITH ORDINALITY AS item(value, ordinality);
        END IF;

        IF v_program_session_id IS NOT NULL THEN
            UPDATE public.program_sessions
            SET workout_log_id = v_log.id, status = 'completed', updated_at = now()
            WHERE id = v_program_session_id AND status = 'planned' AND workout_log_id IS NULL;
        END IF;
    END IF;

    RETURN to_jsonb(v_log) || jsonb_build_object(
        'session_id_dropped', v_requested_session IS NOT NULL AND v_log.session_id IS NULL,
        'program_session_id_dropped', v_requested_program_session IS NOT NULL AND v_log.program_session_id IS NULL,
        'exercises', COALESCE((SELECT jsonb_agg(to_jsonb(we) ORDER BY we.order_index)
            FROM public.workout_exercises we WHERE we.workout_log_id = v_log.id), '[]'::JSONB)
    );
END
$function$;

CREATE OR REPLACE FUNCTION public.save_session_template_full(p_template_id UUID, p_template JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE v_template public.session_templates%ROWTYPE;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
    IF p_template_id IS NULL THEN
        INSERT INTO public.session_templates(user_id, name, notes)
        VALUES ((SELECT auth.uid()), p_template->>'name', NULLIF(p_template->>'notes', ''))
        RETURNING * INTO v_template;
    ELSE
        UPDATE public.session_templates SET name = p_template->>'name', notes = NULLIF(p_template->>'notes', ''),
            source_session_id = NULL, source_split_id = NULL, updated_at = now()
        WHERE id = p_template_id AND user_id = (SELECT auth.uid()) RETURNING * INTO v_template;
        IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002'; END IF;
        DELETE FROM public.session_template_exercises WHERE template_id = p_template_id;
    END IF;
    INSERT INTO public.session_template_exercises(template_id, exercise_name, sets, order_index, unilateral, resistance_profile)
    SELECT v_template.id, item.value->>'exercise_name', (item.value->>'sets')::INTEGER,
        COALESCE(NULLIF(item.value->>'order_index', '')::INTEGER, item.ordinality - 1),
        COALESCE((item.value->>'unilateral')::BOOLEAN, false), NULLIF(item.value->>'resistance_profile', '')
    FROM jsonb_array_elements(COALESCE(p_template->'exercises', '[]'::JSONB)) WITH ORDINALITY AS item(value, ordinality);
    RETURN to_jsonb(v_template) || jsonb_build_object('session_template_exercises',
        COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.order_index) FROM public.session_template_exercises e WHERE e.template_id = v_template.id), '[]'::JSONB));
END
$function$;

CREATE OR REPLACE FUNCTION public.create_session_template_from_session(p_session_id UUID, p_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE v_session public.sessions%ROWTYPE; v_template public.session_templates%ROWTYPE;
BEGIN
    SELECT se.* INTO v_session FROM public.sessions se JOIN public.splits sp ON sp.id = se.split_id
    WHERE se.id = p_session_id AND sp.user_id = (SELECT auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.session_templates(user_id, name, source_session_id, source_split_id)
    VALUES ((SELECT auth.uid()), COALESCE(NULLIF(p_name, ''), v_session.name), v_session.id, v_session.split_id)
    RETURNING * INTO v_template;
    INSERT INTO public.session_template_exercises(template_id, exercise_name, sets, order_index, unilateral, resistance_profile)
    SELECT v_template.id, e.exercise_name, e.sets, e.order_index, e.unilateral, e.resistance_profile
    FROM public.exercises e WHERE e.session_id = v_session.id ORDER BY e.order_index;
    RETURN to_jsonb(v_template) || jsonb_build_object('session_template_exercises',
        COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.order_index) FROM public.session_template_exercises e WHERE e.template_id = v_template.id), '[]'::JSONB));
END
$function$;

CREATE OR REPLACE FUNCTION public.save_meso_template_from_meso(
    p_source_meso_id UUID, p_name TEXT, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_meso public.program_mesos%ROWTYPE;
    v_template public.meso_templates%ROWTYPE;
    v_micro RECORD;
    v_program_session RECORD;
    v_week public.meso_template_weeks%ROWTYPE;
    v_template_session public.meso_template_sessions%ROWTYPE;
BEGIN
    SELECT me.* INTO v_meso
    FROM public.program_mesos me
    JOIN public.program_macros ma ON ma.id = me.macro_id
    JOIN public.programs p ON p.id = ma.program_id
    WHERE me.id = p_source_meso_id AND p.user_id = (SELECT auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'meso_not_found' USING ERRCODE = 'P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.program_micros pm WHERE pm.meso_id = v_meso.id) THEN
        RAISE EXCEPTION 'meso_has_no_weeks' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.meso_templates(user_id, name, focus, progression_type, notes)
    VALUES ((SELECT auth.uid()), p_name, v_meso.focus, v_meso.progression_type, p_notes)
    RETURNING * INTO v_template;

    FOR v_micro IN SELECT * FROM public.program_micros WHERE meso_id = v_meso.id ORDER BY week_index
    LOOP
        INSERT INTO public.meso_template_weeks(template_id, week_index, deload)
        VALUES (v_template.id, v_micro.week_index, v_micro.deload)
        RETURNING * INTO v_week;

        FOR v_program_session IN
            SELECT ps.*, row_number() OVER (ORDER BY ps.date, ps.id) - 1 AS session_order,
                COALESCE(ps.custom_name, st.name, 'Session') AS resolved_name
            FROM public.program_sessions ps
            LEFT JOIN public.session_templates st ON st.id = ps.template_id
            WHERE ps.micro_id = v_micro.id ORDER BY ps.date, ps.id
        LOOP
            INSERT INTO public.meso_template_sessions(week_id, name, day_of_week, order_index)
            VALUES (
                v_week.id, v_program_session.resolved_name,
                EXTRACT(ISODOW FROM v_program_session.date)::INTEGER - 1,
                v_program_session.session_order
            ) RETURNING * INTO v_template_session;

            INSERT INTO public.meso_template_exercises(
                session_id, exercise_name, sets, order_index, unilateral, resistance_profile
            )
            SELECT v_template_session.id, source.exercise_name, source.sets,
                source.order_index, source.unilateral, source.resistance_profile
            FROM (
                SELECT pse.exercise_name, pse.sets, pse.order_index, pse.unilateral, pse.resistance_profile
                FROM public.program_session_exercises pse
                WHERE pse.program_session_id = v_program_session.id
                UNION ALL
                SELECT ste.exercise_name, ste.sets, ste.order_index, ste.unilateral, ste.resistance_profile
                FROM public.session_template_exercises ste
                WHERE ste.template_id = v_program_session.template_id
                  AND NOT EXISTS (SELECT 1 FROM public.program_session_exercises pse WHERE pse.program_session_id = v_program_session.id)
            ) source ORDER BY source.order_index;
        END LOOP;
    END LOOP;

    RETURN to_jsonb(v_template) || jsonb_build_object(
        'created_at', v_template.created_at::TEXT,
        'weeks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'week_index', mw.week_index, 'deload', mw.deload,
                'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'name', ms.name, 'day_of_week', ms.day_of_week, 'order_index', ms.order_index,
                    'exercises', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'exercise_name', me.exercise_name, 'sets', me.sets,
                        'order_index', me.order_index, 'unilateral', me.unilateral,
                        'resistance_profile', me.resistance_profile
                    ) ORDER BY me.order_index) FROM public.meso_template_exercises me WHERE me.session_id = ms.id), '[]'::JSONB)
                ) ORDER BY ms.order_index) FROM public.meso_template_sessions ms WHERE ms.week_id = mw.id), '[]'::JSONB)
            ) ORDER BY mw.week_index) FROM public.meso_template_weeks mw WHERE mw.template_id = v_template.id
        ), '[]'::JSONB)
    );
END
$function$;

CREATE OR REPLACE FUNCTION public.apply_meso_template_full(
    p_template_id UUID, p_macro_id UUID, p_start_date TEXT, p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_template public.meso_templates%ROWTYPE;
    v_program_id UUID;
    v_start_date DATE;
    v_week_count INTEGER;
    v_meso public.program_mesos%ROWTYPE;
    v_week RECORD;
    v_source_session RECORD;
    v_micro public.program_micros%ROWTYPE;
    v_session_template public.session_templates%ROWTYPE;
BEGIN
    SELECT * INTO v_template FROM public.meso_templates
    WHERE id = p_template_id AND user_id = (SELECT auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002'; END IF;
    SELECT ma.program_id INTO v_program_id
    FROM public.program_macros ma JOIN public.programs p ON p.id = ma.program_id
    WHERE ma.id = p_macro_id AND p.user_id = (SELECT auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'macro_not_found' USING ERRCODE = 'P0002'; END IF;
    BEGIN v_start_date := p_start_date::DATE;
    EXCEPTION WHEN invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid_start_date' USING ERRCODE = '22007';
    END;
    SELECT COUNT(*) INTO v_week_count FROM public.meso_template_weeks WHERE template_id = v_template.id;
    IF v_week_count = 0 THEN RAISE EXCEPTION 'template_has_no_weeks' USING ERRCODE = '22023'; END IF;

    INSERT INTO public.program_mesos(macro_id, name, order_index, focus, progression_type, start_date, end_date)
    VALUES (
        p_macro_id, COALESCE(NULLIF(p_name, ''), v_template.name),
        COALESCE((SELECT MAX(order_index) + 1 FROM public.program_mesos WHERE macro_id = p_macro_id), 0),
        v_template.focus, COALESCE(v_template.progression_type, 'linear'),
        v_start_date, v_start_date + (v_week_count * 7 - 1)
    ) RETURNING * INTO v_meso;

    FOR v_week IN SELECT * FROM public.meso_template_weeks WHERE template_id = v_template.id ORDER BY week_index
    LOOP
        INSERT INTO public.program_micros(meso_id, week_index, deload, start_date, end_date)
        VALUES (
            v_meso.id, v_week.week_index, v_week.deload,
            v_start_date + (v_week.week_index * 7),
            v_start_date + (v_week.week_index * 7 + 6)
        ) RETURNING * INTO v_micro;

        FOR v_source_session IN SELECT * FROM public.meso_template_sessions WHERE week_id = v_week.id ORDER BY order_index
        LOOP
            INSERT INTO public.session_templates(user_id, name)
            VALUES ((SELECT auth.uid()), v_source_session.name)
            RETURNING * INTO v_session_template;
            INSERT INTO public.session_template_exercises(template_id, exercise_name, sets, order_index, unilateral, resistance_profile)
            SELECT v_session_template.id, me.exercise_name, me.sets, me.order_index, me.unilateral, me.resistance_profile
            FROM public.meso_template_exercises me WHERE me.session_id = v_source_session.id ORDER BY me.order_index;
            INSERT INTO public.program_sessions(program_id, micro_id, date, template_id, custom_name, status)
            VALUES (
                v_program_id, v_micro.id,
                v_start_date + (v_week.week_index * 7 + v_source_session.day_of_week),
                v_session_template.id, v_source_session.name, 'planned'
            );
        END LOOP;
    END LOOP;
    RETURN jsonb_build_object('meso_id', v_meso.id);
END
$function$;

-- Harden existing trigger functions flagged by the database advisor.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
DO $function_hardening$
BEGIN
    IF to_regprocedure('public.update_custom_exercises_updated_at()') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.update_custom_exercises_updated_at() SET search_path = ''''';
    END IF;
END
$function_hardening$;

REVOKE ALL ON FUNCTION public.create_split_full(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_workout_full(JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_session_template_full(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_session_template_from_session(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_meso_template_from_meso(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_meso_template_full(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_split_full(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_workout_full(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_session_template_full(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_template_from_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_meso_template_from_meso(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_meso_template_full(UUID, UUID, TEXT, TEXT) TO authenticated;
