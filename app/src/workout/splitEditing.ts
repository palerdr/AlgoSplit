import type {
  ExerciseCreate,
  ResistanceProfile,
  SessionCreate,
  SessionResponse,
  SessionTemplateCreate,
  SessionTemplateResponse,
  SplitCreate,
  SplitResponse,
} from '../api/backend';
import type { Exercise } from '../data/exercises';

/** Highest day number a split cycle can reach (matches the analysis engine). */
export const MAX_SPLIT_DAYS = 14;

export interface WorkoutDraftExercise {
  key: string;
  name: string;
  sets: number;
  unilateral: boolean;
  /** Null means "no override" — the exercise's own default profile applies. */
  resistanceProfile: ResistanceProfile | null;
}

export function normalizeResistanceProfile(value: string | null): ResistanceProfile {
  return value === 'ascending' || value === 'descending' ? value : 'mid';
}

/** Preserve a stored null (no override) instead of coercing it to 'mid'. */
export function resistanceProfileOrNull(value: string | null | undefined): ResistanceProfile | null {
  return value === 'ascending' || value === 'mid' || value === 'descending' ? value : null;
}

export interface WorkoutDraft {
  splitId: string;
  sessionId: string | null;
  name: string;
  dayNumber: number;
  exercises: WorkoutDraftExercise[];
}

/** Day numbers run 1..cycle_length; legacy splits without one stay weekly. */
export function splitDayLimit(split: SplitResponse): number {
  const limit = split.cycle_length ?? 7;
  return Math.min(Math.max(limit, 1), MAX_SPLIT_DAYS);
}

export function reorderWorkoutDraftExercises(
  exercises: WorkoutDraftExercise[],
  fromIndex: number,
  toIndex: number
): WorkoutDraftExercise[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= exercises.length ||
    toIndex >= exercises.length
  ) {
    return exercises;
  }
  const reordered = [...exercises];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

/** Swap a catalog exercise into an existing row without losing its programming. */
export function replaceWorkoutDraftExercise(
  exercises: WorkoutDraftExercise[],
  exerciseKey: string,
  replacement: Pick<Exercise, 'name' | 'unilateral' | 'resistanceProfile'>
): WorkoutDraftExercise[] {
  return exercises.map((exercise) =>
    exercise.key === exerciseKey
      ? {
          ...exercise,
          name: replacement.name,
          unilateral: replacement.unilateral,
          resistanceProfile: replacement.resistanceProfile,
        }
      : exercise
  );
}

function draftExercise(
  exercise: SessionResponse['exercises'][number]
): WorkoutDraftExercise {
  return {
    key: exercise.id,
    name: exercise.exercise_name,
    sets: exercise.sets,
    unilateral: exercise.unilateral,
    resistanceProfile: resistanceProfileOrNull(exercise.resistance_profile),
  };
}

export function workoutDraftFromSession(
  splitId: string,
  session: SessionResponse
): WorkoutDraft {
  return {
    splitId,
    sessionId: session.id,
    name: session.name,
    dayNumber: session.day_number,
    exercises: [...session.exercises]
      .sort((left, right) => left.order_index - right.order_index)
      .map(draftExercise),
  };
}

export function newWorkoutDraft(
  split: SplitResponse,
  preferredRestDay?: number
): WorkoutDraft {
  const dayLimit = splitDayLimit(split);
  const occupied = new Set(split.sessions.map((session) => session.day_number));
  const preferredIsOpen =
    Number.isInteger(preferredRestDay) &&
    preferredRestDay! >= 1 &&
    preferredRestDay! <= dayLimit &&
    !occupied.has(preferredRestDay!);
  let dayNumber = preferredIsOpen ? preferredRestDay! : 1;
  if (!preferredIsOpen) {
    while (occupied.has(dayNumber) && dayNumber < dayLimit) dayNumber += 1;
  }
  return {
    splitId: split.id,
    sessionId: null,
    name: '',
    dayNumber,
    exercises: [],
  };
}

/** Start a draft for a standalone workout (session template). */
export function workoutDraftFromTemplate(
  template: SessionTemplateResponse | null
): WorkoutDraft {
  return {
    splitId: '',
    sessionId: null,
    name: template?.name ?? '',
    dayNumber: 1,
    exercises: template
      ? [...template.exercises]
          .sort((left, right) => left.order_index - right.order_index)
          .map((exercise) => ({
            key: exercise.id,
            name: exercise.exercise_name,
            sets: exercise.sets,
            unilateral: exercise.unilateral,
            resistanceProfile: resistanceProfileOrNull(exercise.resistance_profile),
          }))
      : [],
  };
}

/** Start a draft from a wizard day's in-memory workout. */
export function workoutDraftFromWizard(
  workout: { name: string; exercises: ExerciseCreate[] } | null
): WorkoutDraft {
  return {
    splitId: '',
    sessionId: null,
    name: workout?.name ?? '',
    dayNumber: 1,
    exercises: (workout?.exercises ?? []).map((exercise, index) => ({
      key: `wizard:${index}`,
      name: exercise.name,
      sets: exercise.sets,
      unilateral: Boolean(exercise.unilateral),
      resistanceProfile: resistanceProfileOrNull(exercise.resistance_profile),
    })),
  };
}

function exerciseCreate(exercise: WorkoutDraftExercise): ExerciseCreate {
  return {
    name: exercise.name,
    sets: exercise.sets,
    unilateral: exercise.unilateral,
    resistance_profile: exercise.resistanceProfile,
  };
}

function existingSessionCreate(session: SessionResponse): SessionCreate {
  return {
    name: session.name,
    day_number: session.day_number,
    exercises: [...session.exercises]
      .sort((left, right) => left.order_index - right.order_index)
      .map((exercise) => ({
        name: exercise.exercise_name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile:
          exercise.resistance_profile === 'ascending' ||
          exercise.resistance_profile === 'mid' ||
          exercise.resistance_profile === 'descending'
            ? exercise.resistance_profile
            : null,
      })),
  };
}

export function workoutDraftToSessionCreate(draft: WorkoutDraft): SessionCreate {
  return {
    name: draft.name.trim(),
    day_number: draft.dayNumber,
    exercises: draft.exercises.map(exerciseCreate),
  };
}

export function workoutDraftToTemplateCreate(draft: WorkoutDraft): SessionTemplateCreate {
  return {
    name: draft.name.trim(),
    exercises: draft.exercises.map((exercise, index) => ({
      exercise_name: exercise.name,
      sets: exercise.sets,
      order_index: index,
      unilateral: exercise.unilateral,
      resistance_profile: exercise.resistanceProfile,
    })),
  };
}

/** Build the lossless full-replacement payload used to save one workout day. */
export function splitWithWorkoutDraft(
  split: SplitResponse,
  draft: WorkoutDraft
): SplitCreate {
  const replacement = workoutDraftToSessionCreate(draft);
  const sessions = split.sessions.map((session) =>
    session.id === draft.sessionId ? replacement : existingSessionCreate(session)
  );
  if (draft.sessionId === null) sessions.push(replacement);

  return {
    name: split.name,
    cycle_length: split.cycle_length,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    dataset: split.dataset as SplitCreate['dataset'],
    sessions: sessions.sort((left, right) => left.day_number - right.day_number),
  };
}

export function workoutDraftError(
  split: SplitResponse | null,
  draft: WorkoutDraft
): string | null {
  if (!draft.name.trim()) return 'Enter a workout name.';
  if (draft.exercises.length === 0) return 'Add at least one exercise.';
  if (!split) return null;
  const dayLimit = splitDayLimit(split);
  if (!Number.isInteger(draft.dayNumber) || draft.dayNumber < 1 || draft.dayNumber > dayLimit) {
    return `Day must be a whole number from 1 through ${dayLimit}.`;
  }
  const duplicateDay = split.sessions.some(
    (session) => session.id !== draft.sessionId && session.day_number === draft.dayNumber
  );
  if (duplicateDay) return `Day ${draft.dayNumber} already has a workout in this split.`;
  return null;
}
