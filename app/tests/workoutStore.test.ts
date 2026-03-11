jest.mock('zustand/middleware.js', () => jest.requireActual('zustand/middleware'), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useWorkoutStore } from '../src/stores/workoutStore';

describe('workoutStore unilateral serialization', () => {
  afterEach(() => {
    useWorkoutStore.getState().cancelWorkout();
  });

  it('preserves left and right unilateral data as separate exercise entries', () => {
    const store = useWorkoutStore.getState();

    store.startWorkoutFromSession('Leg Day', [
      { name: 'Bulgarian Split Squat', sets: 2, unilateral: true },
    ]);

    const exerciseId = useWorkoutStore.getState().activeWorkout?.exercises[0]?.id;
    expect(exerciseId).toBeTruthy();

    useWorkoutStore.getState().updateSet(exerciseId!, 0, { reps: 10, weight: 25, rir: 2 });
    useWorkoutStore.getState().updateSet(exerciseId!, 1, { reps: 8, weight: 25, rir: 1 });
    useWorkoutStore.getState().updateSet(exerciseId!, 2, { reps: 9, weight: 30, rir: 2 });
    useWorkoutStore.getState().updateSet(exerciseId!, 3, { reps: 7, weight: 30, rir: 1 });

    const workoutData = useWorkoutStore.getState().getWorkoutData();

    expect(workoutData?.exercises).toEqual([
      {
        exercise_name: 'Bulgarian Split Squat',
        sets_completed: 2,
        reps: [10, 9],
        weight: [25, 30],
        rir: [2, 2],
        notes: 'L',
      },
      {
        exercise_name: 'Bulgarian Split Squat',
        sets_completed: 2,
        reps: [8, 7],
        weight: [25, 30],
        rir: [1, 1],
        notes: 'R',
      },
    ]);
  });
});
