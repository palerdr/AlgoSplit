import type {
  ExerciseCreate,
  ResistanceProfile,
  SessionCreate,
  SessionResponse,
  SplitCreate,
  SplitResponse,
} from '../api/backend';

export interface WorkoutDraftExercise {
  key: string;
  name: string;
  sets: number;
  unilateral: boolean;
  resistanceProfile: ResistanceProfile;
}

export function normalizeResistanceProfile(value: string | null): ResistanceProfile {
  return value === 'ascending' || value === 'descending' ? value : 'mid';
}

export interface WorkoutDraft {
  splitId: string;
  sessionId: string | null;
  name: string;
  dayNumber: number;
  exercises: WorkoutDraftExercise[];
}

export function parseWorkoutDayInput(value: string): { text: string; dayNumber: number } {
  const text = value.replace(/\D/g, '').slice(0, 1);
  return { text, dayNumber: text === '' ? Number.NaN : Number(text) };
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

function draftExercise(
  exercise: SessionResponse['exercises'][number]
): WorkoutDraftExercise {
  return {
    key: exercise.id,
    name: exercise.exercise_name,
    sets: exercise.sets,
    unilateral: exercise.unilateral,
    resistanceProfile: normalizeResistanceProfile(exercise.resistance_profile),
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

export function newWorkoutDraft(split: SplitResponse): WorkoutDraft {
  const occupied = new Set(split.sessions.map((session) => session.day_number));
  let dayNumber = 1;
  while (occupied.has(dayNumber) && dayNumber < 7) dayNumber += 1;
  return {
    splitId: split.id,
    sessionId: null,
    name: '',
    dayNumber,
    exercises: [],
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

function draftSessionCreate(draft: WorkoutDraft): SessionCreate {
  return {
    name: draft.name.trim(),
    day_number: draft.dayNumber,
    exercises: draft.exercises.map(exerciseCreate),
  };
}

/** Build the lossless full-replacement payload used to save one workout day. */
export function splitWithWorkoutDraft(
  split: SplitResponse,
  draft: WorkoutDraft
): SplitCreate {
  const replacement = draftSessionCreate(draft);
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

export function workoutDraftError(split: SplitResponse, draft: WorkoutDraft): string | null {
  if (!draft.name.trim()) return 'Enter a workout name.';
  if (!Number.isInteger(draft.dayNumber) || draft.dayNumber < 1 || draft.dayNumber > 7) {
    return 'Day must be a whole number from 1 through 7.';
  }
  const duplicateDay = split.sessions.some(
    (session) => session.id !== draft.sessionId && session.day_number === draft.dayNumber
  );
  if (duplicateDay) return `Day ${draft.dayNumber} already has a workout in this split.`;
  if (draft.exercises.length === 0) return 'Add at least one exercise.';
  return null;
}
