import { loadAllWorkouts, splitToAnalysisRequest, workoutRangeKey } from '../src/api/accountData';
import {
  BackendError,
  SplitResponse,
  WorkoutHistoryResponse,
  WorkoutLogResponse,
} from '../src/api/backend';
import { isSignedOutError, shouldUseAccountData } from '../src/state/AccountState';

function workout(id: string): WorkoutLogResponse {
  return { id } as WorkoutLogResponse;
}

describe('account split adapter', () => {
  it('preserves saved days, settings, exercises, and disables breakdowns', () => {
    const split = {
      id: 'split-1',
      user_id: 'user-1',
      name: 'Actual schedule',
      cycle_length: 10,
      stimulus_duration: 72,
      maintenance_volume: 5,
      dataset: 'average',
      sessions: [
        {
          id: 'session-1',
          split_id: 'split-1',
          name: 'Upper',
          day_number: 2,
          exercises: [
            {
              id: 'exercise-1',
              session_id: 'session-1',
              exercise_name: 'Incline Press',
              sets: 4,
              order_index: 0,
              unilateral: false,
              resistance_profile: 'ascending',
              created_at: '',
            },
          ],
          created_at: '',
          updated_at: '',
        },
        {
          id: 'session-2',
          split_id: 'split-1',
          name: 'Lower',
          day_number: 7,
          exercises: [],
          created_at: '',
          updated_at: '',
        },
      ],
      created_at: '',
      updated_at: '',
    } satisfies SplitResponse;

    expect(splitToAnalysisRequest(split)).toEqual({
      name: 'Actual schedule',
      sessions: [
        {
          name: 'Upper',
          day: 2,
          exercises: [
            {
              name: 'Incline Press',
              sets: 4,
              unilateral: false,
              resistance_profile: 'ascending',
            },
          ],
        },
        { name: 'Lower', day: 7, exercises: [] },
      ],
      cycle_length: 10,
      stimulus_duration: 72,
      maintenance_volume: 5,
      dataset: 'average',
      include_breakdowns: false,
    });
  });
});

describe('complete workout history', () => {
  it('loads every page for the selected day range', async () => {
    const offsets: number[] = [];
    const pages: Record<number, WorkoutHistoryResponse> = {
      0: { workouts: [workout('1'), workout('2')], total: 5 },
      2: { workouts: [workout('3'), workout('4')], total: 5 },
      4: { workouts: [workout('5')], total: 5 },
    };
    const result = await loadAllWorkouts(180, async (params) => {
      expect(params?.days).toBe(180);
      expect(params?.limit).toBe(500);
      const offset = params?.offset ?? 0;
      offsets.push(offset);
      return pages[offset];
    });

    expect(offsets).toEqual([0, 2, 4]);
    expect(result.map((entry) => entry.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(workoutRangeKey(undefined)).toBe('all');
    expect(workoutRangeKey(30)).toBe('30');
  });
});

describe('account mode classification', () => {
  it('uses account data only for an authenticated session', () => {
    expect(shouldUseAccountData('authenticated')).toBe(true);
    expect(shouldUseAccountData('signedOut')).toBe(false);
    expect(shouldUseAccountData('error')).toBe(false);
  });

  it('distinguishes authentication failures from network failures', () => {
    expect(isSignedOutError(new BackendError(401, 'signed out'))).toBe(true);
    expect(isSignedOutError(new BackendError(503, 'offline'))).toBe(false);
  });
});
