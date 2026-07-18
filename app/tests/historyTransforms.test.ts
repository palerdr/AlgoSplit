import type { WorkoutExerciseResponse, WorkoutLogResponse } from '../src/api/backend';
import {
  formatLoggedSet,
  formatWorkoutDate,
  localCalendarDaysAgo,
  sortWorkoutHistory,
  workoutTotals,
} from '../src/components/details/historyTransforms';

function exercise(
  overrides: Partial<WorkoutExerciseResponse> = {}
): WorkoutExerciseResponse {
  return {
    id: 'exercise',
    workout_log_id: 'workout',
    exercise_name: 'Bench Press',
    sets_completed: 2,
    reps: [8, 6],
    weight: [185, 205.5],
    rir: [2, 1],
    order_index: 0,
    notes: 'Pause on chest',
    created_at: '2026-07-15T12:00:00Z',
    ...overrides,
  };
}

function workout(id: string, completedAt: string): WorkoutLogResponse {
  return {
    id,
    user_id: 'user',
    session_id: null,
    split_id: null,
    session_name: 'Push',
    completed_at: completedAt,
    duration_minutes: 45,
    notes: null,
    session_id_dropped: false,
    exercises: [exercise()],
    created_at: completedAt,
  };
}

describe('history presentation transforms', () => {
  it('sorts complete route history newest first without mutating the source', () => {
    const source = [
      workout('old', '2026-07-01T12:00:00Z'),
      workout('new', '2026-07-15T12:00:00Z'),
    ];
    expect(sortWorkoutHistory(source).map((item) => item.id)).toEqual(['new', 'old']);
    expect(source.map((item) => item.id)).toEqual(['old', 'new']);
  });

  it('calculates totals from the actual positional set arrays', () => {
    expect(workoutTotals(workout('one', '2026-07-15T12:00:00Z'))).toEqual({
      sets: 2,
      volume: 2713,
    });
  });

  it('formats decimal loads and positional RIR without inventing missing RIR', () => {
    const logged = exercise();
    expect(formatLoggedSet(logged, 1)).toBe('205.5 lb × 6 · 1 RIR');
    expect(formatLoggedSet({ ...logged, rir: null }, 0)).toBe('185 lb × 8');
  });

  it('labels workouts by local calendar day instead of elapsed 24-hour windows', () => {
    const now = new Date(2026, 6, 18, 0, 15).getTime();
    const twoCalendarDaysAgo = new Date(2026, 6, 16, 23, 45).toISOString();
    const yesterday = new Date(2026, 6, 17, 0, 16).toISOString();

    // The first workout is only 24.5 elapsed hours old, which the previous
    // implementation incorrectly displayed as Yesterday.
    expect(localCalendarDaysAgo(twoCalendarDaysAgo, now)).toBe(2);
    expect(formatWorkoutDate(twoCalendarDaysAgo, now)).not.toBe('Yesterday');
    expect(formatWorkoutDate(yesterday, now)).toBe('Yesterday');
  });
});
