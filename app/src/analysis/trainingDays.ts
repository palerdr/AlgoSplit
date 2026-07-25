export const TRAINING_GRID_DAYS = 35;

export interface TrainingDayCell {
  key: string;
  date: Date;
  workoutCount: number;
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
  completedAt: readonly string[],
  now = new Date(),
  dayCount = TRAINING_GRID_DAYS
): TrainingDayCell[] {
  const safeDayCount = Math.max(1, Math.floor(dayCount));
  const counts = new Map<string, number>();

  for (const value of completedAt) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) continue;
    const key = localTrainingDayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: safeDayCount }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (safeDayCount - 1 - index));
    const key = localTrainingDayKey(date);
    return {
      key,
      date,
      workoutCount: counts.get(key) ?? 0,
    };
  });
}
