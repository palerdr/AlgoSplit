import type { SplitResponse, WorkoutSummaryResponse } from '../api/backend';
import type { CompletedWorkout } from '../state/AppState';
import { AccountWorkoutPlan, accountWorkoutGroups } from './splitSessions';

/** One logged workout attributed to a split, from either the server or the device. */
export interface SplitLogEntry {
  splitId: string;
  sessionId: string | null;
  /** Epoch milliseconds. */
  completedAt: number;
}

const DAY_MS = 86_400_000;

function entryFromSummary(summary: WorkoutSummaryResponse): SplitLogEntry | null {
  if (!summary.split_id) return null;
  const completedAt = new Date(summary.completed_at).getTime();
  if (!Number.isFinite(completedAt)) return null;
  return { splitId: summary.split_id, sessionId: summary.session_id, completedAt };
}

function entryFromLocal(workout: CompletedWorkout): SplitLogEntry | null {
  if (!workout.splitId) return null;
  const completedAt = new Date(workout.date).getTime();
  if (!Number.isFinite(completedAt)) return null;
  return { splitId: workout.splitId, sessionId: workout.sessionId ?? null, completedAt };
}

/**
 * Combine server summaries with device workouts that have not synced yet.
 * Synced local entries are skipped — their server copy already counts.
 */
export function mergeSplitLogs(
  summaries: readonly WorkoutSummaryResponse[],
  localHistory: readonly CompletedWorkout[]
): SplitLogEntry[] {
  const entries: SplitLogEntry[] = [];
  for (const summary of summaries) {
    const entry = entryFromSummary(summary);
    if (entry) entries.push(entry);
  }
  for (const workout of localHistory) {
    if (workout.syncStatus === 'synced' || !workout.syncStatus) continue;
    const entry = entryFromLocal(workout);
    if (entry) entries.push(entry);
  }
  return entries.sort((left, right) => right.completedAt - left.completedAt);
}

/** Longest legitimate gap between workouts: a full run of rest days, floor one week. */
export function splitStreakToleranceDays(split: SplitResponse): number {
  return Math.max(split.cycle_length ?? 7, 7);
}

/**
 * Consecutive workouts logged for this split, walking back from the most
 * recent. The streak breaks when the gap between successive workouts — or
 * between now and the latest one — exceeds the split's tolerance window.
 */
export function splitWorkoutStreak(
  split: SplitResponse,
  logs: readonly SplitLogEntry[],
  now: number
): number {
  const toleranceMs = splitStreakToleranceDays(split) * DAY_MS;
  const own = logs
    .filter((entry) => entry.splitId === split.id)
    .sort((left, right) => right.completedAt - left.completedAt);
  if (own.length === 0) return 0;
  if (now - own[0].completedAt > toleranceMs) return 0;
  let streak = 1;
  for (let index = 1; index < own.length; index += 1) {
    if (own[index - 1].completedAt - own[index].completedAt > toleranceMs) break;
    streak += 1;
  }
  return streak;
}

/**
 * The workout to launch when quick-starting the active split: the day after
 * the most recently logged session, wrapping around the cycle. Falls back to
 * the first workout day when nothing was logged or the session is unknown.
 */
export function nextSplitPlan(
  split: SplitResponse,
  logs: readonly SplitLogEntry[],
  now: number
): AccountWorkoutPlan | null {
  const group = accountWorkoutGroups([split])[0];
  if (!group || group.sessions.length === 0) return null;
  const plans = group.sessions;

  const toleranceMs = splitStreakToleranceDays(split) * DAY_MS;
  const latest = logs
    .filter((entry) => entry.splitId === split.id && entry.sessionId)
    .sort((left, right) => right.completedAt - left.completedAt)[0];
  // A stale log should not resume mid-cycle; start the split over.
  if (!latest || now - latest.completedAt > toleranceMs) return plans[0];

  const lastIndex = plans.findIndex((plan) => plan.sessionId === latest.sessionId);
  if (lastIndex === -1) return plans[0];
  return plans[(lastIndex + 1) % plans.length];
}
