/**
 * Adapters between local state and the backend's workout-log contract, plus
 * the fire-and-forget auto-sync used when a workout finishes.
 *
 * The full generated client (./backend) is loaded lazily and defensively —
 * a missing or broken client must NEVER crash the app: local-first always.
 */

import type { CompletedWorkout } from '../state/AppState';

/** Local CompletedWorkout → backend workout-log payload. */
export function buildWorkoutPayload(workout: CompletedWorkout): Record<string, unknown> {
  return {
    name: workout.name,
    performed_at: workout.date,
    duration_min: workout.durationMin,
    exercises: (workout.exercises ?? []).map((e, i) => ({
      exercise_name: e.name,
      order_index: i,
      sets: (e.records ?? []).map((r, j) => ({
        set_index: j,
        weight: r.weight,
        reps: r.reps,
      })),
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
