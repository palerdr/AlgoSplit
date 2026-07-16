/**
 * Adapters between local state and the backend's workout-log contract, plus
 * the fire-and-forget auto-sync used when a workout finishes.
 *
 * The full generated client (./backend) is loaded lazily and defensively —
 * a missing or broken client must NEVER crash the app: local-first always.
 */

import type { WorkoutCreate } from './backend';
import type { CompletedWorkout } from '../state/AppState';

/** Local CompletedWorkout → backend workout-log payload. */
export function buildWorkoutPayload(workout: CompletedWorkout): WorkoutCreate {
  return {
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

/** Push a finished workout to the server if one is configured; never throws. */
export function autoSyncWorkout(workout: CompletedWorkout): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const backend = require('./backend');
    if (!backend?.backendConfigured?.()) return;
    const result = backend?.workouts?.create?.(buildWorkoutPayload(workout));
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        // offline / signed out — the workout is safe in local storage
      });
    }
  } catch {
    // client module absent — local-first, nothing to do
  }
}
