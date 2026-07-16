/**
 * Adapters between local state and the backend's workout-log contract.
 * Upload lifecycle, persistence, errors, and retries live in AppState so an
 * authenticated write can never fail invisibly.
 */

import { backendConfigured, workouts, type WorkoutCreate, type WorkoutLogResponse } from './backend';
import type { CompletedWorkout } from '../state/AppState';

/** Requeue only failed uploads; synced records are never duplicated. */
export function queueFailedWorkoutRetries(
  history: readonly CompletedWorkout[]
): CompletedWorkout[] {
  return history.map((workout) =>
    workout.syncStatus === 'failed'
      ? { ...workout, syncStatus: 'pending', syncError: undefined }
      : workout
  );
}

/** Local CompletedWorkout → backend workout-log payload. */
export function buildWorkoutPayload(workout: CompletedWorkout): WorkoutCreate {
  return {
    ...(workout.localId ? { client_request_id: workout.localId } : {}),
    ...(workout.sessionId ? { session_id: workout.sessionId } : {}),
    ...(workout.splitId ? { split_id: workout.splitId } : {}),
    session_name: workout.name,
    completed_at: workout.date,
    duration_minutes: workout.durationMin,
    exercises: (workout.exercises ?? []).map((e) => ({
      exercise_name: e.name,
      sets_completed: e.records.length,
      weight: e.records.map((record) => record.weight),
      reps: e.records.map((record) => record.reps),
      ...(e.records.some((record) => record.rir !== undefined)
        ? { rir: e.records.map((record) => record.rir ?? 0) }
        : {}),
      ...(e.notes.trim() ? { notes: e.notes.trim() } : {}),
    })),
  };
}

/** Upload a completed workout; callers must surface and persist failures. */
export async function syncWorkout(workout: CompletedWorkout): Promise<WorkoutLogResponse> {
  if (!backendConfigured()) throw new Error('AlgoSplit backend is not configured');
  return workouts.create(buildWorkoutPayload(workout));
}
