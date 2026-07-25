export const TRAINING_GRID_DAYS = 105;

export interface TrainingDayWorkout {
  completedAt: string;
  volume: number;
}

export interface TrainingDayCell {
  key: string;
  date: Date;
  workoutCount: number;
  volume: number;
}

export function localTrainingDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds an oldest-to-newest calendar window from real workout completion
 * timestamps. Calendar arithmetic keeps local training days stable across DST.
 */
export function buildTrainingDayCells(
  workouts: readonly TrainingDayWorkout[],
  now = new Date(),
  dayCount = TRAINING_GRID_DAYS
): TrainingDayCell[] {
  const safeDayCount = Math.max(1, Math.floor(dayCount));
  const aggregates = new Map<string, { workoutCount: number; volume: number }>();

  for (const workout of workouts) {
    const date = new Date(workout.completedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = localTrainingDayKey(date);
    const previous = aggregates.get(key);
    aggregates.set(key, {
      workoutCount: (previous?.workoutCount ?? 0) + 1,
      volume:
        (previous?.volume ?? 0) +
        (Number.isFinite(workout.volume) ? Math.max(0, workout.volume) : 0),
    });
  }

  return Array.from({ length: safeDayCount }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (safeDayCount - 1 - index));
    const key = localTrainingDayKey(date);
    return {
      key,
      date,
      workoutCount: aggregates.get(key)?.workoutCount ?? 0,
      volume: aggregates.get(key)?.volume ?? 0,
    };
  });
}
