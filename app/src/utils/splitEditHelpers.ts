import type {
  SplitResponse,
  SplitRequest,
  SessionInput,
  ExerciseInput,
} from '../types/api.types';

let _idCounter = 0;
export function generateExerciseId(): string {
  return `ex_${Date.now()}_${++_idCounter}`;
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${++_idCounter}`;
}

interface EditableState {
  name: string;
  sessions: SessionInput[];
  dataset: string;
  stimulus_duration: number;
  maintenance_volume: number;
  cycle_length?: number;
}

export function parseCycleLengthInput(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.min(7, Math.max(1, value)) : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(7, Math.max(1, parsed));
}

// Stimulus duration / maintenance volume must land inside the ranges the
// analysis endpoint accepts (SplitRequest: stimulus 24-96h, maintenance 1-9
// sets). Unlike cycle length these always resolve to a concrete number (the
// fields are never "auto"/blank), so an unparseable or out-of-range entry
// snaps to the bound (or the default) rather than being dropped. Clamping here
// is what stops a typo from persisting a value the analysis would later 422 on
// — which used to make the whole Analysis tab error out and lock the user out.
export const STIMULUS_DURATION_DEFAULT = 48;
export const MAINTENANCE_VOLUME_DEFAULT = 3;

export function parseStimulusDurationInput(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return STIMULUS_DURATION_DEFAULT;
  return Math.min(96, Math.max(24, Math.round(parsed)));
}

export function parseMaintenanceVolumeInput(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return MAINTENANCE_VOLUME_DEFAULT;
  return Math.min(9, Math.max(1, Math.round(parsed)));
}

export function normalizeSessionsForSave(
  sessions: SessionInput[],
  cycleLength?: number,
): SessionInput[] {
  const namedSessions = sessions
    .filter((session) => session.name.trim())
    .map((session) => ({
      ...session,
      name: session.name.trim(),
      day: Math.min(7, Math.max(1, session.day)),
      exercises: session.exercises
        .filter((exercise) => exercise.name.trim())
        .map((exercise) => ({
          ...exercise,
          name: exercise.name.trim(),
        })),
    }));

  if (namedSessions.length === 0) return namedSessions;

  const resolvedCycleLength = parseCycleLengthInput(cycleLength);
  const maxDay = Math.max(...namedSessions.map((session) => session.day));
  if (resolvedCycleLength != null && resolvedCycleLength < maxDay) {
    return namedSessions.map((session, index) => ({
      ...session,
      day: index + 1,
    }));
  }

  return namedSessions;
}

/**
 * Convert a SplitResponse (from API) into editable state for the edit form.
 */
export function splitResponseToEditable(split: SplitResponse): EditableState {
  return {
    name: split.name,
    sessions: split.sessions.map((s) => ({
      id: s.id ?? generateSessionId(),
      name: s.name,
      day: s.day_number,
      exercises: s.exercises.map((ex) => ({
        // Preserve DB IDs so edit saves can target rows without full split replacement.
        id: ex.id ?? generateExerciseId(),
        name: ex.exercise_name,
        sets: ex.sets,
        unilateral: ex.unilateral ?? false,
        resistance_profile: ex.resistance_profile,
      })),
    })),
    dataset: split.dataset,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    cycle_length: split.cycle_length ?? undefined,
  };
}

/**
 * Convert editable state into a SplitRequest for the API.
 */
export function editableToSplitRequest(state: EditableState): SplitRequest {
  const cycleLength = parseCycleLengthInput(state.cycle_length);
  return {
    name: state.name.trim(),
    sessions: normalizeSessionsForSave(state.sessions, cycleLength).map((session) => ({
      name: session.name,
      day: session.day,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile: exercise.resistance_profile,
      })),
    })),
    dataset: state.dataset as 'schoenfeld' | 'pelland' | 'average',
    stimulus_duration: parseStimulusDurationInput(state.stimulus_duration),
    maintenance_volume: parseMaintenanceVolumeInput(state.maintenance_volume),
    cycle_length: cycleLength,
  };
}

/**
 * Normalize a SplitRequest into a deterministic form for comparison.
 */
function normalizeSplitRequest(req: SplitRequest): string {
  const normalized = {
    name: req.name.trim(),
    cycle_length: req.cycle_length ?? null,
    dataset: req.dataset ?? 'pelland',
    stimulus_duration: req.stimulus_duration ?? 48,
    maintenance_volume: req.maintenance_volume ?? 3,
    sessions: (req.sessions || [])
      .map((s) => ({
        name: s.name.trim(),
        day: s.day,
        exercises: s.exercises.map((e) => ({
          name: e.name.trim(),
          sets: e.sets,
          unilateral: e.unilateral ?? false,
          resistance_profile: e.resistance_profile ?? null,
        })),
      }))
      .sort((a, b) => a.day - b.day),
  };
  return JSON.stringify(normalized);
}

/**
 * Check if the current edit state has changes compared to the original split.
 */
export function hasChanges(original: SplitResponse, current: EditableState): boolean {
  const originalReq = editableToSplitRequest(splitResponseToEditable(original));
  const currentReq = editableToSplitRequest(current);
  return normalizeSplitRequest(originalReq) !== normalizeSplitRequest(currentReq);
}
