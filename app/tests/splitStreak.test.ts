import type { SplitResponse, WorkoutSummaryResponse } from '../src/api/backend';
import type { CompletedWorkout, WorkoutSyncStatus } from '../src/state/AppState';
import {
  mergeSplitLogs,
  nextSplitPlan,
  splitDoneToday,
  splitStreakToleranceDays,
  splitWorkoutStreak,
} from '../src/workout/splitStreak';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-07-17T12:00:00Z').getTime();

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function split(): SplitResponse {
  return {
    id: 'split-1',
    user_id: 'user-1',
    name: 'Push Pull',
    cycle_length: 4,
    stimulus_duration: 48,
    maintenance_volume: 4,
    dataset: 'average',
    sessions: [
      {
        id: 'session-2',
        split_id: 'split-1',
        name: 'Pull',
        day_number: 3,
        exercises: [
          {
            id: 'ex-2',
            session_id: 'session-2',
            exercise_name: 'Barbell Row',
            sets: 4,
            order_index: 0,
            unilateral: false,
            resistance_profile: null,
            created_at: daysAgo(30),
          },
        ],
        created_at: daysAgo(30),
        updated_at: daysAgo(30),
      },
      {
        id: 'session-1',
        split_id: 'split-1',
        name: 'Push',
        day_number: 1,
        exercises: [
          {
            id: 'ex-1',
            session_id: 'session-1',
            exercise_name: 'Bench Press',
            sets: 4,
            order_index: 0,
            unilateral: false,
            resistance_profile: 'mid',
            created_at: daysAgo(30),
          },
        ],
        created_at: daysAgo(30),
        updated_at: daysAgo(30),
      },
    ],
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
  };
}

function summary(
  overrides: Partial<WorkoutSummaryResponse> & Pick<WorkoutSummaryResponse, 'id' | 'completed_at'>
): WorkoutSummaryResponse {
  return {
    user_id: 'user-1',
    session_id: 'session-1',
    split_id: 'split-1',
    session_name: 'Push',
    duration_minutes: 60,
    exercise_count: 1,
    total_sets: 4,
    exercise_names: ['Bench Press'],
    created_at: overrides.completed_at,
    ...overrides,
  };
}

function localWorkout(
  overrides: Partial<CompletedWorkout> & Pick<CompletedWorkout, 'date'> & {
    syncStatus?: WorkoutSyncStatus;
  }
): CompletedWorkout {
  return {
    localId: `local-${overrides.date}`,
    name: 'Push',
    exercises: [],
    stimulus: {},
    totalSets: 4,
    volume: 1000,
    durationMin: 60,
    edited: false,
    splitId: 'split-1',
    sessionId: 'session-1',
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('split streak and quick start', () => {
  it('merges remote summaries with unsynced local workouts, newest first', () => {
    const logs = mergeSplitLogs(
      [
        summary({ id: 'w-1', completed_at: daysAgo(5) }),
        summary({ id: 'w-2', completed_at: daysAgo(2), session_id: 'session-2' }),
        summary({ id: 'w-free', completed_at: daysAgo(1), split_id: null }),
      ],
      [
        localWorkout({ date: daysAgo(0.5) }),
        localWorkout({ date: daysAgo(0.25), syncStatus: 'synced' }),
        localWorkout({ date: daysAgo(0.1), splitId: undefined }),
      ]
    );

    // The free workout, the already-synced copy, and the unattributed local
    // entry all stay out; order is newest-first.
    expect(logs.map((entry) => entry.sessionId)).toEqual([
      'session-1',
      'session-2',
      'session-1',
    ]);
    expect(logs[0].completedAt).toBeGreaterThan(logs[2].completedAt);
  });

  it('uses the cycle length as the streak tolerance, floored at a week', () => {
    expect(splitStreakToleranceDays(split())).toBe(7);
    expect(splitStreakToleranceDays({ ...split(), cycle_length: 10 })).toBe(10);
    expect(splitStreakToleranceDays({ ...split(), cycle_length: null })).toBe(7);
  });

  it('counts consecutive split workouts and breaks on long gaps', () => {
    const source = split();
    expect(splitWorkoutStreak(source, [], NOW)).toBe(0);

    const logs = mergeSplitLogs(
      [
        summary({ id: 'w-1', completed_at: daysAgo(1) }),
        summary({ id: 'w-2', completed_at: daysAgo(4) }),
        summary({ id: 'w-3', completed_at: daysAgo(6) }),
        // 12-day gap: everything before it no longer counts.
        summary({ id: 'w-4', completed_at: daysAgo(18) }),
      ],
      []
    );
    expect(splitWorkoutStreak(source, logs, NOW)).toBe(3);

    const stale = mergeSplitLogs([summary({ id: 'w-5', completed_at: daysAgo(9) })], []);
    expect(splitWorkoutStreak(source, stale, NOW)).toBe(0);
  });

  it('ignores other splits when counting the streak', () => {
    const logs = mergeSplitLogs(
      [
        summary({ id: 'w-1', completed_at: daysAgo(1) }),
        summary({ id: 'w-2', completed_at: daysAgo(2), split_id: 'split-other' }),
        summary({ id: 'w-3', completed_at: daysAgo(3) }),
      ],
      []
    );
    expect(splitWorkoutStreak(split(), logs, NOW)).toBe(2);
  });

  it('quick-starts the first workout day when nothing was logged recently', () => {
    const source = split();
    expect(nextSplitPlan(source, [], NOW)?.sessionId).toBe('session-1');

    const stale = mergeSplitLogs([summary({ id: 'w-1', completed_at: daysAgo(9) })], []);
    expect(nextSplitPlan(source, stale, NOW)?.sessionId).toBe('session-1');
  });

  it('advances to the next workout day and wraps around the cycle', () => {
    const source = split();
    const afterPush = mergeSplitLogs([summary({ id: 'w-1', completed_at: daysAgo(1) })], []);
    expect(nextSplitPlan(source, afterPush, NOW)?.sessionId).toBe('session-2');

    const afterPull = mergeSplitLogs(
      [summary({ id: 'w-2', completed_at: daysAgo(1), session_id: 'session-2' })],
      []
    );
    expect(nextSplitPlan(source, afterPull, NOW)?.sessionId).toBe('session-1');
  });

  it('returns null for splits with no workout days', () => {
    expect(nextSplitPlan({ ...split(), sessions: [] }, [], NOW)).toBeNull();
  });

  it('locks the split to the calendar day', () => {
    const source = split();
    expect(splitDoneToday(source, [], NOW)).toBe(false);

    const today = mergeSplitLogs([summary({ id: 'w-1', completed_at: daysAgo(0.1) })], []);
    expect(splitDoneToday(source, today, NOW)).toBe(true);

    const yesterday = mergeSplitLogs([summary({ id: 'w-2', completed_at: daysAgo(1) })], []);
    expect(splitDoneToday(source, yesterday, NOW)).toBe(false);

    const otherSplit = mergeSplitLogs(
      [summary({ id: 'w-3', completed_at: daysAgo(0.1), split_id: 'split-other' })],
      []
    );
    expect(splitDoneToday(source, otherSplit, NOW)).toBe(false);
  });
});
