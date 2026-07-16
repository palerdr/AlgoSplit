import type { ExerciseResponse, SplitResponse } from '../src/api/backend';
import {
  accountWorkoutGroups,
  accountWorkoutPlans,
  resolveSavedExercise,
} from '../src/workout/splitSessions';

function exercise(
  overrides: Partial<ExerciseResponse> & Pick<ExerciseResponse, 'id' | 'exercise_name'>
): ExerciseResponse {
  return {
    session_id: 'session-1',
    sets: 3,
    order_index: 0,
    unilateral: false,
    resistance_profile: 'mid',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function split(): SplitResponse {
  return {
    id: 'split-1',
    user_id: 'user-1',
    name: 'My Actual Split',
    cycle_length: 8,
    stimulus_duration: 48,
    maintenance_volume: 4,
    dataset: 'average',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sessions: [
      {
        id: 'session-2',
        split_id: 'split-1',
        name: 'Lower',
        day_number: 4,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        exercises: [
          exercise({ id: 'ex-2', exercise_name: 'Leg Press', order_index: 1, sets: 4 }),
          exercise({ id: 'ex-1', exercise_name: 'Back Squat', order_index: 0, sets: 5 }),
        ],
      },
      {
        id: 'session-1',
        split_id: 'split-1',
        name: 'Upper',
        day_number: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        exercises: [exercise({ id: 'ex-3', exercise_name: 'Barbell Bench Press' })],
      },
    ],
  };
}

describe('account workout plans', () => {
  it('groups sessions beneath their persisted split', () => {
    const groups = accountWorkoutGroups([split()]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: 'split-1',
      name: 'My Actual Split',
      cycleLength: 8,
    });
    expect(groups[0].sessions.map((session) => session.name)).toEqual(['Upper', 'Lower']);
  });

  it('flattens real split sessions in day and exercise order', () => {
    const plans = accountWorkoutPlans([split()]);

    expect(plans.map((plan) => plan.name)).toEqual(['Upper', 'Lower']);
    expect(plans[0]).toMatchObject({
      splitName: 'My Actual Split',
      dayNumber: 1,
      sessionId: 'session-1',
    });
    expect(plans[1].exercises.map(({ exercise, sets }) => [exercise.name, sets])).toEqual([
      ['Back Squat', 5],
      ['Leg Press', 4],
    ]);
  });

  it('resolves catalog exercises using normalized saved names', () => {
    const resolved = resolveSavedExercise(
      exercise({ id: 'catalog', exercise_name: 'barbell-bench press' })
    );

    expect(resolved.id).toBe('barbell_bench_press');
    expect(resolved.muscles.length).toBeGreaterThan(0);
  });

  it('keeps custom exercises instead of silently dropping them', () => {
    const resolved = resolveSavedExercise(
      exercise({
        id: 'custom-9',
        exercise_name: 'My Cable Sweep',
        unilateral: true,
        resistance_profile: 'ascending',
      })
    );

    expect(resolved).toMatchObject({
      id: 'account:custom-9',
      name: 'My Cable Sweep',
      unilateral: true,
      resistanceProfile: 'ascending',
      muscles: [],
    });
  });
});
