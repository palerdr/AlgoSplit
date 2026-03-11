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

interface EditableState {
  name: string;
  sessions: SessionInput[];
  dataset: string;
  stimulus_duration: number;
  maintenance_volume: number;
  cycle_length?: number;
}

/**
 * Convert a SplitResponse (from API) into editable state for the edit form.
 */
export function splitResponseToEditable(split: SplitResponse): EditableState {
  return {
    name: split.name,
    sessions: split.sessions.map((s) => ({
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
  return {
    name: state.name.trim(),
    sessions: state.sessions
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        day: s.day,
        exercises: s.exercises
          .filter((e) => e.name.trim())
          .map((e) => ({
            name: e.name.trim(),
            sets: e.sets,
            unilateral: e.unilateral,
            resistance_profile: e.resistance_profile,
          })),
      })),
    dataset: state.dataset as 'schoenfeld' | 'pelland' | 'average',
    stimulus_duration: state.stimulus_duration,
    maintenance_volume: state.maintenance_volume,
    cycle_length: state.cycle_length,
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
