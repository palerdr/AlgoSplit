/**
 * Typed client for the AlgoSplit FastAPI backend (backend/main.py).
 *
 * The refreshed frontend is local-first: every feature works offline on the
 * ported TS engine. When EXPO_PUBLIC_ALGOSPLIT_API is set (e.g.
 * http://192.168.0.172:8000), analysis-grade features upgrade to the real
 * backend engine — same request/response contract as the legacy frontend
 * (schemas/models.py SplitRequest → AnalysisResponse).
 */

import { WorkoutTemplate } from '../data/templates';
import { getExercise } from '../data/exercises';

export const API_URL: string | null =
  (process.env.EXPO_PUBLIC_ALGOSPLIT_API as string | undefined)?.replace(/\/$/, '') ?? null;

export function backendConfigured(): boolean {
  return API_URL !== null && API_URL.length > 0;
}

// ── Contract types (schemas/models.py) ──────────────────────────────────────

export interface ApiExerciseInput {
  name: string;
  sets: number;
  unilateral?: boolean;
  resistance_profile?: 'ascending' | 'mid' | 'descending' | null;
}

export interface ApiSessionInput {
  name: string;
  day: number; // 1-based day within the cycle
  exercises: ApiExerciseInput[];
}

export interface SplitRequest {
  name: string;
  sessions: ApiSessionInput[];
  cycle_length?: number;
  stimulus_duration?: number; // 24–96, default 48
  maintenance_volume?: number; // 1–9, default 3
  dataset?: 'schoenfeld' | 'pelland' | 'average';
  include_breakdowns?: boolean;
}

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
  leverage: string;
  damage_tier: string;
  recovery_readiness?: number | null;
}

export interface AnalysisResponse {
  split_name: string;
  cycle_length: number;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  muscles: MuscleStats[];
  // group_summaries / suggestions / summary / session_breakdowns also exist —
  // typed loosely until screens consume them.
  group_summaries?: unknown[];
  suggestions?: unknown[];
  summary?: Record<string, unknown>;
}

// ── Requests ────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!API_URL) throw new Error('AlgoSplit backend not configured');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include', // backend auth is a JWT cookie
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Run the real backend engine on a split definition. */
export function analyzeSplit(request: SplitRequest): Promise<AnalysisResponse> {
  return post<AnalysisResponse>('/api/analyze-split', request);
}

// ── Adapters ────────────────────────────────────────────────────────────────

/**
 * Express one of our workout templates, performed `timesPerWeek` times, as a
 * backend SplitRequest. Exercise names round-trip cleanly: our catalog names
 * came from AlgoSplit, so the backend's matcher resolves them exactly.
 */
export function templateToSplitRequest(
  template: WorkoutTemplate,
  timesPerWeek: number
): SplitRequest {
  const n = Math.max(1, Math.min(7, Math.round(timesPerWeek)));
  const days = Array.from({ length: n }, (_, i) => 1 + Math.round((7 / n) * i));

  const exercises: ApiExerciseInput[] = template.exercises
    .map((te): ApiExerciseInput | null => {
      const exercise = getExercise(te.exerciseId);
      if (!exercise) return null;
      return {
        name: exercise.name,
        sets: te.sets,
        unilateral: exercise.unilateral || undefined,
      };
    })
    .filter((e): e is ApiExerciseInput => e !== null);

  return {
    name: template.name,
    sessions: days.map((day, i) => ({
      name: n > 1 ? `${template.name} ${i + 1}` : template.name,
      day,
      exercises,
    })),
    cycle_length: 7,
    stimulus_duration: 48,
    maintenance_volume: 2, // matches the TS engine's MAINTENANCE_VOLUME
    dataset: 'average', // matches the TS engine's curve
    include_breakdowns: false,
  };
}

/** AnalysisResponse → per-region net map (same shape the local engine returns). */
export function netFromAnalysis(response: AnalysisResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of response.muscles) {
    if (Number.isFinite(m.net_stimulus)) out[m.region_id] = m.net_stimulus;
  }
  return out;
}
