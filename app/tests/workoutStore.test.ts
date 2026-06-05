jest.mock('zustand/middleware.js', () => jest.requireActual('zustand/middleware'), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useWorkoutStore } from '../src/stores/workoutStore';

describe('workoutStore completedAt date parity', () => {
  afterEach(() => {
    useWorkoutStore.getState().cancelWorkout();
  });

  it('preserves the selected local date in completedAt regardless of timezone', () => {
    const store = useWorkoutStore.getState();
    store.setSelectedWorkoutDate('2026-04-15');
    store.startWorkoutFromSession('Push', [
      { name: 'Bench Press', sets: 1, unilateral: false },
    ]);
    const exerciseId = useWorkoutStore.getState().activeWorkout?.exercises[0]?.id;
    useWorkoutStore.getState().updateSet(exerciseId!, 0, { reps: 5, weight: 100 });

    const { completedAt } = useWorkoutStore.getState().getWorkoutData()!;

    // Backend slices the first 10 chars to populate /api/workouts/dates,
    // which drives the calendar dot. Must equal the user's chosen date.
    expect(completedAt?.slice(0, 10)).toBe('2026-04-15');
    // Full string must still be a parseable ISO-8601 timestamp.
    expect(completedAt).toMatch(/^2026-04-15T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns undefined completedAt when no workout date was selected', () => {
    const store = useWorkoutStore.getState();
    store.setSelectedWorkoutDate(null);
    store.startWorkoutFromSession('Push', [
      { name: 'Bench Press', sets: 1, unilateral: false },
    ]);
    expect(useWorkoutStore.getState().getWorkoutData()?.completedAt).toBeUndefined();
  });
});

describe('exerciseNotesByKey legacy fallback + forward migration', () => {
  afterEach(() => {
    useWorkoutStore.getState().cancelWorkout();
    useWorkoutStore.setState({ exerciseNotesByKey: {} });
  });

  it('rehydrates notes saved under the legacy splitId:sessionId:templateExerciseId key', () => {
    // A note saved before the key schema change (commit 457b10e). New key
    // schema is splitId:sessionName:exerciseName — lookup misses there, and
    // without a fallback the user's notes were orphaned permanently.
    const splitId = 'split-abc';
    const sessionId = 'sess-xyz';
    const templateExerciseId = 'tpl-1';
    const legacyKey = `${splitId}:${sessionId}:${templateExerciseId}`;
    useWorkoutStore.setState({ exerciseNotesByKey: { [legacyKey]: 'cue: tuck elbows' } });

    useWorkoutStore.getState().startWorkoutFromSession(
      'Push',
      [{ name: 'Bench Press', sets: 1, unilateral: false, templateExerciseId }],
      undefined,
      sessionId,
      splitId,
    );

    const exercise = useWorkoutStore.getState().activeWorkout?.exercises[0];
    expect(exercise?.notes).toBe('cue: tuck elbows');
  });

  it('forward-migrates a legacy hit to the new key so subsequent reads hit O(1)', () => {
    const splitId = 'split-abc';
    const sessionId = 'sess-xyz';
    const sessionName = 'Push';
    const exerciseName = 'Bench Press';
    const templateExerciseId = 'tpl-1';
    const legacyKey = `${splitId}:${sessionId}:${templateExerciseId}`;
    const newKey = `${splitId}:${sessionName}:${exerciseName}`;
    useWorkoutStore.setState({ exerciseNotesByKey: { [legacyKey]: 'cue: tuck elbows' } });

    useWorkoutStore.getState().startWorkoutFromSession(
      sessionName,
      [{ name: exerciseName, sets: 1, unilateral: false, templateExerciseId }],
      undefined,
      sessionId,
      splitId,
    );

    expect(useWorkoutStore.getState().exerciseNotesByKey[newKey]).toBe('cue: tuck elbows');
  });

  it('prefers a note saved under the new key over the legacy one', () => {
    // The new key is the source of truth once present; legacy is only a
    // fallback. This protects users who edited notes after the schema change.
    const splitId = 'split-abc';
    const sessionId = 'sess-xyz';
    const sessionName = 'Push';
    const exerciseName = 'Bench Press';
    const templateExerciseId = 'tpl-1';
    const legacyKey = `${splitId}:${sessionId}:${templateExerciseId}`;
    const newKey = `${splitId}:${sessionName}:${exerciseName}`;
    useWorkoutStore.setState({
      exerciseNotesByKey: {
        [legacyKey]: 'old stale note',
        [newKey]: 'current cue',
      },
    });

    useWorkoutStore.getState().startWorkoutFromSession(
      sessionName,
      [{ name: exerciseName, sets: 1, unilateral: false, templateExerciseId }],
      undefined,
      sessionId,
      splitId,
    );

    expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.notes).toBe('current cue');
  });
});

describe('addSet preserves exercise.notes', () => {
  afterEach(() => {
    useWorkoutStore.getState().cancelWorkout();
  });

  it('keeps notes intact when a set is appended (bug regression: notes were perceived to disappear on Add Set)', () => {
    const store = useWorkoutStore.getState();
    store.startWorkoutFromSession('Push', [
      { name: 'Bench Press', sets: 2, unilateral: false },
    ]);
    const exerciseId = useWorkoutStore.getState().activeWorkout?.exercises[0]?.id!;
    useWorkoutStore.getState().updateExerciseNotes(exerciseId, 'pause at chest');
    useWorkoutStore.getState().addSet(exerciseId);
    const ex = useWorkoutStore.getState().activeWorkout?.exercises[0];
    expect(ex?.notes).toBe('pause at chest');
    expect(ex?.sets.length).toBe(3);
  });
});

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
