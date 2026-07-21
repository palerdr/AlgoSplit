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

function eventKey(entry: SplitLogEntry): string {
  return `${entry.splitId}:${entry.sessionId ?? ''}:${entry.completedAt}`;
}

/**
 * Combine server summaries with persisted device workouts. Local history is
 * the startup source even after sync; once summaries load, remote ids and an
 * exact split/session/time key prevent the same workout from counting twice.
 */
export function mergeSplitLogs(
  summaries: readonly WorkoutSummaryResponse[],
  localHistory: readonly CompletedWorkout[]
): SplitLogEntry[] {
  const entries: SplitLogEntry[] = [];
  const remoteIds = new Set<string>();
  const seenEvents = new Set<string>();
  for (const summary of summaries) {
    const entry = entryFromSummary(summary);
    if (!entry) continue;
    remoteIds.add(summary.id);
    seenEvents.add(eventKey(entry));
    entries.push(entry);
  }
  for (const workout of localHistory) {
    const entry = entryFromLocal(workout);
    if (!entry) continue;
    if (workout.remoteId && remoteIds.has(workout.remoteId)) continue;
    const key = eventKey(entry);
    if (seenEvents.has(key)) continue;
    seenEvents.add(key);
    entries.push(entry);
  }
  return entries.sort((left, right) => right.completedAt - left.completedAt);
}

/** Longest legitimate gap between workouts: a full run of rest days, floor one week. */
export function splitStreakToleranceDays(split: SplitResponse): number {
  return Math.max(split.cycle_length ?? 7, 7);
}

function sameLocalDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The split is locked to the calendar day: once one of its workouts is logged
 * today, quick start must not roll into the next cycle day until tomorrow.
 */
export function splitDoneToday(
  split: SplitResponse,
  logs: readonly SplitLogEntry[],
  now: number
): boolean {
  const latest = logs
    .filter((entry) => entry.splitId === split.id)
    .sort((left, right) => right.completedAt - left.completedAt)[0];
  return latest ? sameLocalDay(latest.completedAt, now) : false;
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
