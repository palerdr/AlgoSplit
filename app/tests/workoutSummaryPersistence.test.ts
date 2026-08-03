import type { WorkoutSummaryListResponse } from '../src/api/backend';
import {
  decodePersistedResource,
  encodePersistedResource,
  workoutSummariesCacheKey,
} from '../src/state/localPersistence';

const summaries: WorkoutSummaryListResponse = {
  workouts: [
    {
      id: 'workout-1',
      user_id: 'user-a',
      session_id: 'session-1',
      split_id: 'split-1',
      session_name: 'Push',
      completed_at: '2026-07-28T12:00:00.000Z',
      duration_minutes: 45,
      exercise_count: 4,
      total_sets: 12,
      exercise_names: ['Bench Press'],
      created_at: '2026-07-28T12:45:00.000Z',
    },
  ],
  total: 1,
};

describe('workout summary persistence', () => {
  it('round-trips the last verified summary baseline', () => {
    const restored = decodePersistedResource<WorkoutSummaryListResponse>(
      encodePersistedResource(summaries, 1234)
    );

    expect(restored?.data).toEqual(summaries);
    expect(restored?.savedAt).toBe(1234);
  });

  it('rejects malformed or timestamp-free cache entries', () => {
    expect(decodePersistedResource<WorkoutSummaryListResponse>(null)).toBeNull();
    expect(decodePersistedResource<WorkoutSummaryListResponse>('not-json')).toBeNull();
    expect(
      decodePersistedResource<WorkoutSummaryListResponse>(
        JSON.stringify({ data: summaries })
      )
    ).toBeNull();
    expect(workoutSummariesCacheKey('user/a')).toContain('user%2Fa');
  });
});
