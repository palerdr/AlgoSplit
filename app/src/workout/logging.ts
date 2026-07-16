import type { WorkoutLogResponse } from '../api/backend';
import type { CompletedWorkout, SetRecord } from '../state/AppState';

export interface SetDraft {
  weight: string;
  reps: string;
  rir: string;
}

export type SetDraftField = keyof SetDraft;

export interface SetDraftValidation {
  record: SetRecord | null;
  errors: Partial<Record<SetDraftField, string>>;
}

export interface PreviousExerciseData {
  records: SetRecord[];
  notes: string;
}

const normalized = (value: string) => value.trim().toLocaleLowerCase();

/** Validate exactly what the workout API accepts, with tighter UI limits. */
export function validateSetDraft(draft: SetDraft): SetDraftValidation {
  const errors: SetDraftValidation['errors'] = {};
  const weightText = draft.weight.trim();
  const repsText = draft.reps.trim();
  const rirText = draft.rir.trim();

  const weight = Number(weightText);
  if (!weightText) {
    errors.weight = 'Enter weight (use 0 for bodyweight)';
  } else if (!Number.isFinite(weight) || weight < 0 || weight > 9999.99) {
    errors.weight = 'Weight must be between 0 and 9,999.99';
  }

  const reps = Number(repsText);
  if (!repsText) {
    errors.reps = 'Enter reps';
  } else if (!Number.isInteger(reps) || reps < 1 || reps > 999) {
    errors.reps = 'Reps must be a whole number from 1 to 999';
  }

  const rir = rirText ? Number(rirText) : undefined;
  if (rirText && (!Number.isInteger(rir) || (rir as number) < 0 || (rir as number) > 5)) {
    errors.rir = 'RIR must be a whole number from 0 to 5';
  }

  if (Object.keys(errors).length > 0) return { record: null, errors };
  return {
    record: { weight, reps, ...(rir === undefined ? {} : { rir }) },
    errors,
  };
}

/** Most recent matching account workout, preserving positional set shadows. */
export function previousRemoteExercise(
  workouts: WorkoutLogResponse[],
  sessionName: string,
  exerciseName: string
): PreviousExerciseData | null {
  const sessionKey = normalized(sessionName);
  const exerciseKey = normalized(exerciseName);
  const ordered = [...workouts].sort(
    (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  );

  for (const workout of ordered) {
    if (normalized(workout.session_name) !== sessionKey) continue;
    const exercise = workout.exercises.find(
      (candidate) => normalized(candidate.exercise_name) === exerciseKey
    );
    if (!exercise) continue;
    const count = Math.min(exercise.reps.length, exercise.weight.length);
    return {
      records: Array.from({ length: count }, (_, index) => ({
        weight: exercise.weight[index],
        reps: exercise.reps[index],
        ...(exercise.rir?.[index] == null ? {} : { rir: exercise.rir[index] }),
      })),
      notes: exercise.notes ?? '',
    };
  }
  return null;
}

/** Signed-out/demo equivalent of previousRemoteExercise. */
export function previousLocalExercise(
  history: CompletedWorkout[],
  sessionName: string,
  exerciseName: string
): PreviousExerciseData | null {
  const sessionKey = normalized(sessionName);
  const exerciseKey = normalized(exerciseName);
  const ordered = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const workout of ordered) {
    if (normalized(workout.name) !== sessionKey) continue;
    const exercise = workout.exercises.find((candidate) => normalized(candidate.name) === exerciseKey);
    if (!exercise) continue;
    return { records: exercise.records, notes: exercise.notes ?? '' };
  }
  return null;
}
