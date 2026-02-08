-- Programs Feature Migration
-- Run this in the Supabase SQL Editor

-- Ensure the updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. programs
CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  goal text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  stimulus_duration integer NOT NULL DEFAULT 48,
  maintenance_volume integer NOT NULL DEFAULT 4,
  dataset text NOT NULL DEFAULT 'pelland'
    CHECK (dataset IN ('schoenfeld', 'pelland', 'average')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_programs_user_id ON programs(user_id);
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own programs" ON programs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. program_macros
CREATE TABLE IF NOT EXISTS program_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_macros_program ON program_macros(program_id, order_index);
ALTER TABLE program_macros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own macros" ON program_macros FOR ALL
  USING (EXISTS (SELECT 1 FROM programs WHERE programs.id = program_macros.program_id AND programs.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM programs WHERE programs.id = program_macros.program_id AND programs.user_id = auth.uid()));
CREATE TRIGGER update_program_macros_updated_at BEFORE UPDATE ON program_macros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. program_mesos
CREATE TABLE IF NOT EXISTS program_mesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macro_id uuid NOT NULL REFERENCES program_macros(id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text,
  order_index integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  progression_type text DEFAULT 'linear'
    CHECK (progression_type IN ('linear', 'undulating', 'block', 'custom')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_mesos_macro ON program_mesos(macro_id, order_index);
ALTER TABLE program_mesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mesos" ON program_mesos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM program_macros m JOIN programs p ON p.id = m.program_id
    WHERE m.id = program_mesos.macro_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_macros m JOIN programs p ON p.id = m.program_id
    WHERE m.id = program_mesos.macro_id AND p.user_id = auth.uid()
  ));
CREATE TRIGGER update_program_mesos_updated_at BEFORE UPDATE ON program_mesos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. program_micros
CREATE TABLE IF NOT EXISTS program_micros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meso_id uuid NOT NULL REFERENCES program_mesos(id) ON DELETE CASCADE,
  week_index integer NOT NULL,
  start_date date,
  end_date date,
  deload boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_micros_meso ON program_micros(meso_id, week_index);
ALTER TABLE program_micros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own micros" ON program_micros FOR ALL
  USING (EXISTS (
    SELECT 1 FROM program_mesos me JOIN program_macros ma ON ma.id = me.macro_id
    JOIN programs p ON p.id = ma.program_id
    WHERE me.id = program_micros.meso_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_mesos me JOIN program_macros ma ON ma.id = me.macro_id
    JOIN programs p ON p.id = ma.program_id
    WHERE me.id = program_micros.meso_id AND p.user_id = auth.uid()
  ));
CREATE TRIGGER update_program_micros_updated_at BEFORE UPDATE ON program_micros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. session_templates
CREATE TABLE IF NOT EXISTS session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  source_split_id uuid REFERENCES splits(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_templates_user ON session_templates(user_id);
ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON session_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_session_templates_updated_at BEFORE UPDATE ON session_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. session_template_exercises
CREATE TABLE IF NOT EXISTS session_template_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  sets integer NOT NULL CHECK (sets > 0),
  order_index integer NOT NULL DEFAULT 0,
  unilateral boolean NOT NULL DEFAULT false,
  resistance_profile text CHECK (resistance_profile IN ('ascending', 'mid', 'descending')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON session_template_exercises(template_id, order_index);
ALTER TABLE session_template_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own template exercises" ON session_template_exercises FOR ALL
  USING (EXISTS (SELECT 1 FROM session_templates WHERE session_templates.id = session_template_exercises.template_id AND session_templates.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM session_templates WHERE session_templates.id = session_template_exercises.template_id AND session_templates.user_id = auth.uid()));

-- 7. program_sessions (calendar entries)
CREATE TABLE IF NOT EXISTS program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  micro_id uuid REFERENCES program_micros(id) ON DELETE SET NULL,
  date date NOT NULL,
  template_id uuid REFERENCES session_templates(id) ON DELETE SET NULL,
  custom_name text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'completed', 'skipped')),
  notes text,
  workout_log_id uuid REFERENCES workout_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_sessions_date ON program_sessions(program_id, date);
CREATE INDEX IF NOT EXISTS idx_program_sessions_micro ON program_sessions(micro_id);
ALTER TABLE program_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own program sessions" ON program_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM programs WHERE programs.id = program_sessions.program_id AND programs.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM programs WHERE programs.id = program_sessions.program_id AND programs.user_id = auth.uid()));
CREATE TRIGGER update_program_sessions_updated_at BEFORE UPDATE ON program_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. program_session_exercises (overrides when detached from template)
CREATE TABLE IF NOT EXISTS program_session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_session_id uuid NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  sets integer NOT NULL CHECK (sets > 0),
  order_index integer NOT NULL DEFAULT 0,
  unilateral boolean NOT NULL DEFAULT false,
  resistance_profile text CHECK (resistance_profile IN ('ascending', 'mid', 'descending')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pse_session ON program_session_exercises(program_session_id, order_index);
ALTER TABLE program_session_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pse" ON program_session_exercises FOR ALL
  USING (EXISTS (
    SELECT 1 FROM program_sessions ps JOIN programs p ON p.id = ps.program_id
    WHERE ps.id = program_session_exercises.program_session_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM program_sessions ps JOIN programs p ON p.id = ps.program_id
    WHERE ps.id = program_session_exercises.program_session_id AND p.user_id = auth.uid()
  ));
