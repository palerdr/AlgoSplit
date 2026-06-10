// API Response Types - Mirror backend Pydantic schemas

// ============================================
// AUTH TYPES
// ============================================

export interface UserInfo {
  id: string;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

// ============================================
// ANALYSIS TYPES
// ============================================

export interface MuscleStats {
  region_id: string;
  display_name: string;
  parent_group: string;
  stimulus: number;
  atrophy: number;
  net_stimulus: number;
  primary_sets: number;
  prime_sets: number;
  secondary_sets: number;
  tertiary_sets: number;
  frequency: number;
  leverage: 'S' | 'M' | 'L';
  damage_tier: '+' | '0' | '-';
  /**
   * Time-based readiness for the next stimulus application, 0..1. Computed by
   * the backend as min(1, hours_since_last_trained / stimulus_duration) at
   * window end — the same ratio the engine uses internally when retraining
   * within the recovery window. Optional/null when the muscle wasn't trained
   * as a prime mover in the window: treat as 1.0 (fully ready). Drives the
   * dashboard's Recovery dial.
   */
  recovery_readiness?: number | null;
}

export interface MuscleGroupSummary {
  group: string;
  total_net_stimulus: number;
  total_sets: number;
  regions: string[];
}

export interface OptimizationSuggestion {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  muscle: string;
  issue: string;
  suggestion: string;
}

export interface SummaryStats {
  total_sets: number;
  muscles_trained: number;
  total_muscles: number;
  avg_net_stimulus: number;
  avg_sets_per_muscle: number;
  group_summaries?: MuscleGroupSummary[];
}

export interface SetBreakdown {
  set_number: number;
  weight: number;
  recovery_multiplier: number;
  bilateral_multiplier: number;
  local_multiplier: number;
  global_multiplier: number;
  consecutive_day_multiplier: number;
  final_stimulus: number;
}

export interface MuscleContribution {
  muscle_id: string;
  display_name: string;
  tier: 'prime' | 'secondary' | 'tertiary' | 'quaternary';
  base_weight: number;
  leverage_weight: number;
  sets: SetBreakdown[];
  total_stimulus: number;
}

export interface ExerciseBreakdown {
  name: string;
  pattern: string;
  sets: number;
  resistance_profile: 'ascending' | 'mid' | 'descending';
  is_bilateral: boolean;
  is_unilateral: boolean;
  axial_load: number;
  muscle_contributions: MuscleContribution[];
}

export interface SessionBreakdown {
  session_name: string;
  day_number: number;
  exercises: ExerciseBreakdown[];
  cumulative_sets: number;
  cumulative_axial_fatigue: number;
  final_cns_multiplier: number;
  consecutive_days: number;
  consecutive_day_penalty: number;
}

export interface AnalysisResponse {
  split_name: string;
  cycle_length: number;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  muscles: MuscleStats[];
  group_summaries: MuscleGroupSummary[];
  suggestions: OptimizationSuggestion[];
  summary: SummaryStats;
  session_breakdowns?: SessionBreakdown[];
}

export interface TieredTargets {
  prime: Record<string, number>;
  secondary: Record<string, number>;
  tertiary: Record<string, number>;
  quaternary: Record<string, number>;
}

export interface ExerciseParseResponse {
  original_text: string;
  recognized: boolean;
  pattern: string | null;
  pattern_name: string | null;
  tiered_targets: TieredTargets | null;
  bilateral: boolean;
  unilateral: boolean;
  axial_load: number;
  resistance_profile: 'ascending' | 'mid' | 'descending';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
}

export interface MuscleRegionInfo {
  region_id: string;
  display_name: string;
  parent_group: string;
  leverage: 'S' | 'M' | 'L';
  damage_tier: '+' | '0' | '-';
  recovery_modifier: number;
  axial_fatigue_contributor: boolean;
  primary_actions: string[];
  notes: string | null;
}

export interface MuscleRegionsResponse {
  regions: MuscleRegionInfo[];
  total_count: number;
  parent_groups: string[];
}

export interface PatternInfo {
  name: string;
  display_name: string;
  tiered_targets: TieredTargets;
  bilateral: boolean;
  axial_load: number;
  resistance_profile: string;
  notes: string | null;
}

export interface PatternsResponse {
  patterns: PatternInfo[];
  total_count: number;
}

// ============================================
// SPLIT TYPES
// ============================================

export interface ExerciseInput {
  id?: string;  // Stable ID for drag-and-drop (generated client-side)
  name: string;
  sets: number;
  unilateral?: boolean;
  resistance_profile?: 'ascending' | 'mid' | 'descending' | null;
}

export interface SessionInput {
  id?: string; // Stable client-side ID for session drag-and-drop
  name: string;
  day: number;
  exercises: ExerciseInput[];
}

export interface SplitRequest {
  name: string;
  sessions: SessionInput[];
  cycle_length?: number;
  stimulus_duration?: number;
  maintenance_volume?: number;
  dataset?: 'schoenfeld' | 'pelland' | 'average';
  include_breakdowns?: boolean;
}

export interface ExerciseResponse {
  id: string;
  session_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: 'ascending' | 'mid' | 'descending' | null;
  created_at: string;
}

export interface SessionResponse {
  id: string;
  split_id: string;
  name: string;
  day_number: number;
  exercises: ExerciseResponse[];
  created_at: string;
  updated_at: string;
}

export interface SplitResponse {
  id: string;
  user_id: string;
  name: string;
  cycle_length?: number | null;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  sessions: SessionResponse[];
  created_at: string;
  updated_at: string;
}

export interface SplitListResponse {
  splits: SplitResponse[];
  total: number;
}

export interface SplitUpdate {
  name?: string;
  cycle_length?: number | null;
  stimulus_duration?: number;
  maintenance_volume?: number;
  dataset?: string;
}

// ============================================
// WORKOUT TYPES
// ============================================

export interface WorkoutExerciseCreate {
  exercise_name: string;
  sets_completed: number;
  reps: number[];
  weight: number[];
  rir?: number[]; // Reps in reserve for each set
  notes?: string;
}

export interface WorkoutLogCreate {
  session_id?: string;
  split_id?: string;
  program_session_id?: string;
  session_name: string;
  completed_at?: string;
  duration_minutes?: number;
  notes?: string;
  exercises: WorkoutExerciseCreate[];
}

export interface WorkoutExerciseResponse {
  id: string;
  workout_log_id: string;
  exercise_name: string;
  sets_completed: number;
  reps: number[];
  weight: number[];
  rir: number[] | null;
  order_index: number;
  notes: string | null;
  created_at: string;
}

export interface WorkoutLogResponse {
  id: string;
  user_id: string;
  session_id: string | null;
  split_id: string | null;
  session_name: string;
  completed_at: string;
  duration_minutes: number | null;
  notes: string | null;
  exercises: WorkoutExerciseResponse[];
  created_at: string;
}

export interface WorkoutSummaryResponse {
  id: string;
  user_id: string;
  session_id: string | null;
  split_id: string | null;
  session_name: string;
  completed_at: string;
  duration_minutes: number | null;
  exercise_count: number;
  total_sets: number;
  exercise_names: string[];
  created_at: string;
}

export interface WorkoutHistoryResponse {
  workouts: WorkoutLogResponse[];
  total: number;
}

export interface WorkoutSummaryListResponse {
  workouts: WorkoutSummaryResponse[];
  total: number;
}

export interface WorkoutDatesResponse {
  dates: string[];
  total: number;
}

export interface WorkoutStatsResponse {
  total_workouts: number;
  total_sets: number;
  total_volume_pounds: number;
  average_duration_minutes: number | null;
  most_frequent_exercises: Array<{ exercise: string; count: number }>;
  last_workout_date: string | null;
}

// ============================================
// OVERRIDE TYPES
// ============================================

export interface ExerciseOverrideCreate {
  exercise_name: string;
  pattern_override: string;
}

export interface ExerciseOverrideResponse {
  id: string;
  user_id: string;
  exercise_name: string;
  pattern_override: string;
  created_at: string;
  updated_at: string;
}

export interface ExerciseOverrideListResponse {
  overrides: ExerciseOverrideResponse[];
  total: number;
}

// ============================================
// CUSTOM EXERCISE TYPES
// ============================================

export interface CustomExerciseCreate {
  exercise_name: string;
  prime_targets: Record<string, number>;
  secondary_targets: Record<string, number>;
  tertiary_targets: Record<string, number>;
  quaternary_targets: Record<string, number>;
  axial_load: number;
  resistance_profile: 'ascending' | 'mid' | 'descending';
  is_bilateral: boolean;
}

export interface CustomExerciseUpdate {
  exercise_name?: string;
  prime_targets?: Record<string, number>;
  secondary_targets?: Record<string, number>;
  tertiary_targets?: Record<string, number>;
  quaternary_targets?: Record<string, number>;
  axial_load?: number;
  resistance_profile?: 'ascending' | 'mid' | 'descending';
  is_bilateral?: boolean;
}

export interface CustomExerciseResponse {
  id: string;
  user_id: string;
  exercise_name: string;
  prime_targets: Record<string, number>;
  secondary_targets: Record<string, number>;
  tertiary_targets: Record<string, number>;
  quaternary_targets: Record<string, number>;
  axial_load: number;
  resistance_profile: 'ascending' | 'mid' | 'descending';
  is_bilateral: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomExerciseListResponse {
  exercises: CustomExerciseResponse[];
  total: number;
}

// ============================================
// PROGRAM TYPES
// ============================================

export interface ProgramCreate {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  goal?: string | null;
  stimulus_duration?: number;
  maintenance_volume?: number;
  dataset?: 'schoenfeld' | 'pelland' | 'average';
}

export interface ProgramUpdate {
  name?: string;
  start_date?: string | null;
  end_date?: string | null;
  goal?: string | null;
  status?: 'draft' | 'active' | 'completed' | 'archived';
  stimulus_duration?: number;
  maintenance_volume?: number;
  dataset?: 'schoenfeld' | 'pelland' | 'average';
}

export interface ProgramResponse {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProgramListResponse {
  programs: ProgramResponse[];
  total: number;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: 'ascending' | 'mid' | 'descending' | null;
  created_at: string;
}

export interface SessionTemplateResponse {
  id: string;
  user_id: string;
  name: string;
  source_session_id: string | null;
  source_split_id: string | null;
  notes: string | null;
  exercises: TemplateExercise[];
  created_at: string;
  updated_at: string;
}

export interface SessionTemplateListResponse {
  templates: SessionTemplateResponse[];
  total: number;
}

export interface SessionTemplateCreate {
  name: string;
  exercises: Array<{
    exercise_name: string;
    sets: number;
    order_index?: number;
    unilateral?: boolean;
    resistance_profile?: 'ascending' | 'mid' | 'descending' | null;
  }>;
  notes?: string | null;
}

export interface ProgramSessionExercise {
  id: string;
  program_session_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: 'ascending' | 'mid' | 'descending' | null;
  created_at: string;
}

export interface ProgramSessionResponse {
  id: string;
  program_id: string;
  micro_id: string | null;
  date: string;
  template_id: string | null;
  template_name: string | null;
  custom_name: string | null;
  status: 'planned' | 'completed' | 'skipped';
  notes: string | null;
  workout_log_id: string | null;
  exercises: ProgramSessionExercise[];
  created_at: string;
  updated_at: string;
}

export interface ProgramSessionListResponse {
  sessions: ProgramSessionResponse[];
  total: number;
}

export interface ProgramDetailResponse {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  sessions: ProgramSessionResponse[];
  created_at: string;
  updated_at: string;
}

export interface ProgramSessionCreate {
  date: string;
  template_id?: string | null;
  custom_name?: string | null;
  notes?: string | null;
}

export interface ResolvedExercise {
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
}

export interface ResolvedExerciseList {
  exercises: ResolvedExercise[];
}

export interface TodaySessionItem {
  id: string;
  program_id: string;
  program_name: string;
  date: string;
  display_name: string;
  status: string;
  template_id: string | null;
}

export interface TodaySessionsResponse {
  sessions: TodaySessionItem[];
}

export interface DiagnosticsRequest {
  level: 'session' | 'micro' | 'meso' | 'macro';
  target_id?: string | null;
}

// ============================================
// DIAGNOSTICS RESPONSE TYPES
// ============================================

export interface WeekAnalysis {
  week_index: number;
  analysis: AnalysisResponse | null;
}

export interface ProgressionEntry {
  week_index: number;
  net_stimulus: number;
  stimulus: number;
  atrophy: number;
}

export interface ProgressionRegion {
  region_id: string;
  display_name: string;
  parent_group: string;
  values: ProgressionEntry[];
}

export interface MesoDiagnosticsResponse {
  level: 'meso';
  target_id: string;
  weeks: WeekAnalysis[];
  progression: ProgressionRegion[];
}

export interface MesoSummary {
  meso_id: string;
  name: string;
  avg_stimulus: Record<string, {
    region_id: string;
    display_name: string;
    parent_group: string;
    avg_net_stimulus: number;
  }>;
  week_count?: number;
}

export interface MacroDiagnosticsResponse {
  level: 'macro';
  target_id: string;
  meso_summaries: MesoSummary[];
}

// ============================================
// PERIODIZATION TYPES
// ============================================

export interface MicroCycleResponse {
  id: string;
  meso_id: string;
  week_index: number;
  start_date: string | null;
  end_date: string | null;
  deload: boolean;
  notes: string | null;
  session_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface MesoCycleResponse {
  id: string;
  macro_id: string;
  name: string;
  focus: string | null;
  order_index: number;
  start_date: string | null;
  end_date: string | null;
  progression_type: 'linear' | 'undulating' | 'block' | 'custom';
  notes: string | null;
  micros: MicroCycleResponse[];
  created_at: string;
  updated_at: string;
}

export interface MacroCycleResponse {
  id: string;
  program_id: string;
  name: string;
  order_index: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  mesos: MesoCycleResponse[];
  created_at: string;
  updated_at: string;
}

export interface MacroCycleListResponse {
  macros: MacroCycleResponse[];
  total: number;
}

export interface MacroCycleCreate {
  name: string;
  order_index?: number;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
}

export interface MesoCycleCreate {
  name: string;
  focus?: string | null;
  order_index?: number;
  start_date?: string | null;
  end_date?: string | null;
  progression_type?: 'linear' | 'undulating' | 'block' | 'custom';
  notes?: string | null;
}

export interface MicroCycleCreate {
  week_index: number;
  start_date?: string | null;
  end_date?: string | null;
  deload?: boolean;
  notes?: string | null;
}

// ============================================
// MESO TEMPLATE TYPES
// ============================================

export interface MesoTemplateExercise {
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
}

export interface MesoTemplateSession {
  name: string;
  day_of_week: number;
  order_index: number;
  exercises: MesoTemplateExercise[];
}

export interface MesoTemplateWeek {
  week_index: number;
  deload: boolean;
  sessions: MesoTemplateSession[];
}

export interface MesoTemplateResponse {
  id: string;
  user_id: string;
  name: string;
  focus: string | null;
  progression_type: string | null;
  notes: string | null;
  weeks: MesoTemplateWeek[];
  created_at: string;
}

export interface MesoTemplateListResponse {
  id: string;
  name: string;
  focus: string | null;
  week_count: number;
  created_at: string;
}

// ============================================
// BODYWEIGHT TYPES
// ============================================

export interface BodyweightEntryCreate {
  weight: number;
  recorded_at?: string | null;
  notes?: string | null;
}

export interface BodyweightEntryResponse {
  id: string;
  user_id: string;
  weight: number;
  recorded_at: string;
  notes: string | null;
  created_at: string;
}

export interface BodyweightEntryListResponse {
  entries: BodyweightEntryResponse[];
  total: number;
}

export interface BodyweightBatchCreate {
  entries: BodyweightEntryCreate[];
}

// ============================================
// Spreadsheet Import
// ============================================

export interface ImportSheet {
  name: string;
  grid: string[][];
}

export interface ImportPreviewRequest {
  sheets: ImportSheet[];
  split_name_hint?: string;
}

export type ImportExerciseStatus = 'matched' | 'ambiguous' | 'unrecognized';

export interface ImportedExerciseStatus {
  session_index: number;
  exercise_index: number;
  raw_name: string;
  status: ImportExerciseStatus;
  pattern: string | null;
  score: number;
}

export interface ImportPreviewExercise {
  name: string;
  sets: number;
  unilateral: boolean;
}

export interface ImportPreviewSession {
  name: string;
  day_number: number;
  exercises: ImportPreviewExercise[];
}

export interface ImportPreviewSplit {
  name: string;
  sessions: ImportPreviewSession[];
}

export interface ImportPreviewResponse {
  split: ImportPreviewSplit | null;
  layout: 'long' | 'wide' | 'blocked' | 'unknown';
  confidence: number;
  exercises: ImportedExerciseStatus[];
  warnings: string[];
  sheet_name: string | null;
  skipped_sheets: string[];
}
