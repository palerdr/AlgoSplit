import { computeCapacityScore } from '../components/details/progressTransforms';
import type { CompletedWorkout } from '../state/AppState';

const DAY_MS = 86_400_000;
const TREND_WINDOW_MS = 8 * 7 * DAY_MS;

export interface PublishableLiftTrend {
  exercise_name: string;
  change_percent: number;
  period_label: string;
}

export interface WeeklyActivityPublication {
  week_start: string;
  week_end: string;
  workouts_completed: number;
  planned_workouts: null;
  consistency_percent: number;
  snapshot_date: string;
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weeklyActivityPublication(
  history: readonly CompletedWorkout[],
  now = new Date()
): WeeklyActivityPublication {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const workoutsCompleted = history.filter((workout) => {
    const completedAt = new Date(workout.date).getTime();
    return Number.isFinite(completedAt)
      && completedAt >= start.getTime()
      && completedAt <= end.getTime();
  }).length;
  return {
    week_start: localDateKey(start),
    week_end: localDateKey(end),
    workouts_completed: workoutsCompleted,
    planned_workouts: null,
    consistency_percent: Math.min(100, Math.round((workoutsCompleted / 7) * 100)),
    snapshot_date: localDateKey(now),
  };
}

/** Derive opt-in strength trends without publishing individual sets or workout rows. */
export function liftTrendCandidates(
  history: readonly CompletedWorkout[],
  now = new Date()
): PublishableLiftTrend[] {
  const cutoff = now.getTime() - TREND_WINDOW_MS;
  const groups = new Map<
    string,
    { name: string; points: Array<{ at: number; capacity: number }> }
  >();

  for (const workout of history) {
    const at = new Date(workout.date).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime() + 60_000) continue;
    for (const exercise of workout.exercises) {
      const best = exercise.records.reduce(
        (score, record) => Math.max(score, computeCapacityScore(record.weight, record.reps, record.rir ?? null)),
        0
      );
      if (!(best > 0)) continue;
      const key = exercise.name.trim().toLocaleLowerCase();
      if (!key) continue;
      const group = groups.get(key) ?? { name: exercise.name.trim(), points: [] };
      group.points.push({ at, capacity: best });
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group): (PublishableLiftTrend & { latestAt: number }) | null => {
      const points = group.points.sort((a, b) => a.at - b.at);
      if (points.length < 2 || points[0].capacity <= 0) return null;
      const first = points[0];
      const latest = points[points.length - 1];
      const days = Math.max(1, Math.round((latest.at - first.at) / DAY_MS));
      const change = ((latest.capacity - first.capacity) / first.capacity) * 100;
      return {
        exercise_name: group.name,
        change_percent: Math.max(-999.99, Math.min(999.99, Math.round(change * 100) / 100)),
        period_label: days < 14 ? `${days} days` : `${Math.max(2, Math.round(days / 7))} weeks`,
        latestAt: latest.at,
      };
    })
    .filter((trend): trend is PublishableLiftTrend & { latestAt: number } => trend !== null)
    .sort((a, b) => b.latestAt - a.latestAt || a.exercise_name.localeCompare(b.exercise_name))
    .map(({ latestAt: _latestAt, ...trend }) => trend);
}
