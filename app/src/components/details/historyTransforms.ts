import type { WorkoutExerciseResponse, WorkoutLogResponse } from '../../api/backend';

export interface WorkoutTotals {
  sets: number;
  volume: number;
}

export function sortWorkoutHistory(workouts: WorkoutLogResponse[]): WorkoutLogResponse[] {
  return [...workouts].sort(
    (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  );
}

export function workoutTotals(workout: WorkoutLogResponse): WorkoutTotals {
  let sets = 0;
  let volume = 0;
  for (const exercise of workout.exercises) {
    const count = Math.min(exercise.reps.length, exercise.weight.length);
    sets += count;
    for (let index = 0; index < count; index++) {
      volume += exercise.weight[index] * exercise.reps[index];
    }
  }
  return { sets, volume };
}

export function formatLoggedSet(exercise: WorkoutExerciseResponse, index: number): string {
  const weight = exercise.weight[index];
  const reps = exercise.reps[index];
  const rir = exercise.rir?.[index];
  const load = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
  return `${load} lb × ${reps}${rir == null ? '' : ` · ${rir} RIR`}`;
}
