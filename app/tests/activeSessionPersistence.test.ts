import {
  nextSessionExerciseOrdinal,
  restoreActiveSession,
} from '../src/state/activeSessionPersistence';
import type { ActiveSession } from '../src/state/AppState';

const startedAt = new Date(2026, 6, 16, 9, 30).getTime();

function activeSession(): ActiveSession {
  return {
    name: 'Upper',
    planned: true,
    currentIndex: 1,
    startedAt,
    edited: true,
    splitId: 'split-1',
    sessionId: 'session-1',
    exercises: [
      {
        sessionExerciseId: `session-${startedAt}-exercise-0`,
        exercise: {
          id: 'bench-press',
          name: 'Bench Press',
          muscles: [{ region: 'pectoralis_major', weight: 1, tier: 'prime' }],
          axialLoad: 0.2,
          resistanceProfile: 'ascending',
          unilateral: false,
          equipment: 'barbell',
        },
        targetSets: 3,
        warmupEnabled: true,
        warmupCompleted: true,
        warmupBypassed: false,
        completedSets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 7, rir: 1 },
        ],
        lastCompletedAt: startedAt + 1_000,
        notes: 'Pause on the chest',
      },
      {
        sessionExerciseId: `session-${startedAt}-exercise-4`,
        exercise: {
          id: 'account:custom-1',
          name: 'Custom Cable Press',
          muscles: [],
          axialLoad: 0,
          resistanceProfile: 'mid',
          unilateral: true,
        },
        targetSets: 2,
        warmupEnabled: false,
        warmupCompleted: false,
        warmupBypassed: false,
        completedSets: [{ weight: 40, reps: 12 }],
        notes: '',
      },
    ],
  };
}

describe('active workout persistence', () => {
  it('migrates grouped rows into resumable one-set blocks without losing work', () => {
    const source = activeSession();
    const restored = restoreActiveSession(JSON.parse(JSON.stringify(source)));

    expect(restored?.startedAt).toBe(startedAt);
    expect(restored?.exercises).toHaveLength(5);
    expect(restored?.exercises.map((exercise) => exercise.targetSets)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(restored?.exercises.map((exercise) => exercise.completedSets.length)).toEqual([
      1, 1, 0, 1, 0,
    ]);
    expect(restored?.exercises.slice(0, 3).map((exercise) => exercise.setOrdinal)).toEqual([
      1, 2, 3,
    ]);
    expect(restored?.exercises.slice(0, 3).map((exercise) => exercise.setCount)).toEqual([
      3, 3, 3,
    ]);
    expect(restored?.exercises[1].lastCompletedAt).toBe(startedAt + 1_000);
    expect(restored?.currentIndex).toBe(4);
    expect(nextSessionExerciseOrdinal(restored as ActiveSession)).toBe(5);
  });

  it('isolates corrupt fields while keeping the rest of a resumable workout', () => {
    const source = activeSession();
    const restored = restoreActiveSession({
      ...source,
      currentIndex: 999,
      exercises: [
        {
          ...source.exercises[0],
          sessionExerciseId: '',
          targetSets: 1,
          completedSets: [
            ...source.exercises[0].completedSets,
            { weight: -1, reps: 8 },
          ],
        },
        {
          ...source.exercises[1],
          sessionExerciseId: `session-${startedAt}-exercise-0`,
        },
        { exercise: null },
      ],
    });

    expect(restored).not.toBeNull();
    expect(restored?.exercises).toHaveLength(4);
    expect(restored?.exercises.map((exercise) => exercise.completedSets.length)).toEqual([
      1, 1, 1, 0,
    ]);
    expect(restored?.exercises.every((exercise) => exercise.targetSets === 1)).toBe(true);
    expect(new Set(restored?.exercises.map((exercise) => exercise.sessionExerciseId)).size).toBe(4);
    expect(restored?.currentIndex).toBe(3);
  });

  it('rejects snapshots that cannot identify a real session', () => {
    expect(restoreActiveSession(null)).toBeNull();
    expect(restoreActiveSession({ startedAt: 0, exercises: [] })).toBeNull();
    expect(restoreActiveSession({ startedAt, exercises: 'broken' })).toBeNull();
  });

  it('round-trips one-set source occurrence metadata and drops partial metadata', () => {
    const source = activeSession();
    const restored = restoreActiveSession({
      ...source,
      exercises: [
        {
          ...source.exercises[0],
          targetSets: 1,
          completedSets: [source.exercises[0].completedSets[0]],
          sourceOccurrenceId: `session-${startedAt}-occurrence-0`,
          setOrdinal: 1,
          setCount: 3,
        },
        {
          ...source.exercises[1],
          sourceOccurrenceId: `session-${startedAt}-occurrence-4`,
          setOrdinal: 2,
          // No setCount: restore it as a safe legacy row, never a false sibling.
        },
      ],
    });

    expect(restored?.exercises[0]).toMatchObject({
      sourceOccurrenceId: `session-${startedAt}-occurrence-0`,
      setOrdinal: 1,
      setCount: 3,
    });
    expect(restored?.exercises).toHaveLength(3);
    expect(restored?.exercises[1].sourceOccurrenceId).not.toBe(
      `session-${startedAt}-occurrence-4`
    );
    expect(restored?.exercises.slice(1).map((exercise) => exercise.setOrdinal)).toEqual([
      1, 2,
    ]);
    expect(restored?.exercises.slice(1).map((exercise) => exercise.setCount)).toEqual([
      2, 2,
    ]);
  });

  it('does not truncate valid block sessions at the former 200-row limit', () => {
    const source = activeSession();
    const exercises = Array.from({ length: 201 }, (_, index) => ({
      ...source.exercises[0],
      sessionExerciseId: `session-${startedAt}-exercise-${index}`,
      sourceOccurrenceId: `session-${startedAt}-occurrence-${index}`,
      setOrdinal: 1,
      setCount: 1,
      targetSets: 1,
      completedSets: [],
      lastCompletedAt: undefined,
    }));

    const restored = restoreActiveSession({
      ...source,
      currentIndex: 200,
      exercises,
    });

    expect(restored?.exercises).toHaveLength(201);
    expect(restored?.currentIndex).toBe(200);
  });

  it('preserves the end-of-workout cursor through grouped-row migration', () => {
    const source = activeSession();
    const restored = restoreActiveSession({
      ...source,
      currentIndex: source.exercises.length,
    });

    expect(restored?.exercises).toHaveLength(5);
    expect(restored?.currentIndex).toBe(5);
  });
});
