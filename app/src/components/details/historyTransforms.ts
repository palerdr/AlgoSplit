import type { WorkoutExerciseResponse, WorkoutLogResponse } from '../../api/backend';

export interface WorkoutTotals {
  sets: number;
  volume: number;
}

const DAY_MS = 86_400_000;

function localCalendarDayOrdinal(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/** Calendar-day distance in the viewer's timezone, independent of hour/DST gaps. */
export function localCalendarDaysAgo(iso: string, now = Date.now()): number | null {
  const date = new Date(iso);
  const current = new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(current.getTime())) return null;
  return localCalendarDayOrdinal(current) - localCalendarDayOrdinal(date);
}

export function formatWorkoutDate(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const days = localCalendarDaysAgo(iso, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  const current = new Date(now);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === current.getFullYear() ? undefined : 'numeric',
  });
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
