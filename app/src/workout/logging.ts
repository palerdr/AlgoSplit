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

export interface ExerciseRecordProvenance {
  record: SetRecord;
  completedAt: number;
  source: 'local' | 'remote';
}

const normalized = (value: string) => value.trim().toLocaleLowerCase();

const timestamp = (value: string): number => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

function remoteExerciseRecord(
  workout: WorkoutLogResponse,
  exerciseKey: string
): SetRecord | null {
  // `exercises` is normally returned in order_index order, but use the
  // explicit field so a reordered API response cannot change provenance.
  // The array position is a deterministic fallback for legacy duplicate rows
  // that share the same order_index.
  const matches = workout.exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => normalized(exercise.exercise_name) === exerciseKey)
    .sort(
      (a, b) =>
        b.exercise.order_index - a.exercise.order_index || b.index - a.index
    );

  for (const { exercise } of matches) {
    const count = Math.min(exercise.reps.length, exercise.weight.length);
    if (count === 0) continue;
    const index = count - 1;
    return {
      weight: exercise.weight[index],
      reps: exercise.reps[index],
      ...(exercise.rir?.[index] == null ? {} : { rir: exercise.rir[index] }),
    };
  }
  return null;
}

/**
 * Newest committed account-history set for an exercise, regardless of which
 * split/workout contained it. Duplicate exercise rows use their live order;
 * the final paired weight/reps entry in the latest row is the newest set.
 */
function latestRemoteExerciseRecordWithProvenance(
  workouts: WorkoutLogResponse[],
  exerciseName: string
): ExerciseRecordProvenance | null {
  const exerciseKey = normalized(exerciseName);
  const ordered = [...workouts].sort(
    (a, b) =>
      timestamp(b.completed_at) - timestamp(a.completed_at) ||
      timestamp(b.created_at) - timestamp(a.created_at)
  );

  for (const workout of ordered) {
    const record = remoteExerciseRecord(workout, exerciseKey);
    if (record) {
      return {
        record,
        completedAt: timestamp(workout.completed_at),
        source: 'remote',
      };
    }
  }
  return null;
}

export function latestRemoteExerciseRecord(
  workouts: WorkoutLogResponse[],
  exerciseName: string
): SetRecord | null {
  return latestRemoteExerciseRecordWithProvenance(workouts, exerciseName)?.record ?? null;
}

/**
 * Signed-out/demo equivalent of latestRemoteExerciseRecord. Local completed
 * exercises retain execution order in their array, so the last matching row
 * with a committed record owns the latest set.
 */
function latestLocalExerciseRecordWithProvenance(
  history: CompletedWorkout[],
  exerciseName: string
): ExerciseRecordProvenance | null {
  const exerciseKey = normalized(exerciseName);
  const ordered = [...history].sort((a, b) => timestamp(b.date) - timestamp(a.date));

  for (const workout of ordered) {
    for (let index = workout.exercises.length - 1; index >= 0; index--) {
      const exercise = workout.exercises[index];
      if (normalized(exercise.name) !== exerciseKey || exercise.records.length === 0) continue;
      return {
        record: exercise.records[exercise.records.length - 1],
        completedAt: timestamp(workout.date),
        source: 'local',
      };
    }
  }
  return null;
}

export function latestLocalExerciseRecord(
  history: CompletedWorkout[],
  exerciseName: string
): SetRecord | null {
  return latestLocalExerciseRecordWithProvenance(history, exerciseName)?.record ?? null;
}

/**
 * Resolve authenticated history without assuming either cache is freshest.
 * Local pending/failed work may not be on the server yet, while remote history
 * may contain a newer workout recorded on another device. A remote tie wins
 * because it is the account-authoritative copy of the same completion time.
 */
export function latestAuthenticatedExerciseRecord(
  workouts: WorkoutLogResponse[],
  localHistory: CompletedWorkout[],
  exerciseName: string
): ExerciseRecordProvenance | null {
  const remote = latestRemoteExerciseRecordWithProvenance(workouts, exerciseName);
  const local = latestLocalExerciseRecordWithProvenance(localHistory, exerciseName);
  if (!remote) return local;
  if (!local) return remote;
  return local.completedAt > remote.completedAt ? local : remote;
}

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
