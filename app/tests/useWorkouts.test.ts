import { buildPreviousExerciseMap, invalidateWorkoutDerivedQueries } from '../src/hooks/useWorkouts';

describe('invalidateWorkoutDerivedQueries', () => {
  it('invalidates previous workout shadows after history changes', () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
    };

    invalidateWorkoutDerivedQueries(queryClient as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workouts', 'previous'] });
  });
});

describe('buildPreviousExerciseMap', () => {
  it('uses the most recent named exercise anywhere in the active split', () => {
    const previous = buildPreviousExerciseMap([
      {
        session_name: 'Push B',
        split_id: 'split-a',
        exercises: [{ exercise_name: 'Chest Press Machine', reps: [5], weight: [230], notes: 'controlled eccentric' }],
      },
      {
        session_name: 'Push A',
        split_id: 'split-a',
        exercises: [{ exercise_name: 'CHEST  PRESS  MACHINE', reps: [8], weight: [200] }],
      },
      {
        session_name: 'Other Split',
        split_id: 'split-b',
        exercises: [{ exercise_name: 'Chest Press Machine', reps: [12], weight: [100] }],
      },
    ], 'Push C', 'split-a');

    expect(previous).toEqual({
      'chest press machine': {
        reps: [5],
        weight: [230],
        rir: undefined,
        notes: 'controlled eccentric',
      },
    });
  });

  it('removes the legacy unilateral side prefix before reusing a note', () => {
    const previous = buildPreviousExerciseMap([
      {
        session_name: 'Leg Day',
        split_id: 'split-a',
        exercises: [
          { exercise_name: 'Single-leg Curl', reps: [10], weight: [45], notes: 'L | keep hips square' },
          { exercise_name: 'Single-leg Curl', reps: [9], weight: [45], notes: 'R | keep hips square' },
        ],
      },
    ], 'Leg Day', 'split-a');

    expect(previous?.['single-leg curl']?.notes).toBe('keep hips square');
  });

  it('handles prototype-like exercise names without mutating the result map', () => {
    const previous = buildPreviousExerciseMap([
      {
        session_name: 'Quick Workout',
        split_id: 'split-a',
        exercises: [{ exercise_name: '__proto__', reps: [1], weight: [1] }],
      },
    ], 'Quick Workout', 'split-a');

    expect(Object.getPrototypeOf(previous)).toBeNull();
    expect(previous?.__proto__).toEqual({ reps: [1], weight: [1], rir: undefined, notes: undefined });
  });
});
