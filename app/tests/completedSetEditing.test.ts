import type { ActiveSession, SetRecord } from '../src/state/AppState';
import {
  editCompletedSetInSession,
  lastUsedAfterCompletedSetEdit,
} from '../src/state/completedSetEditing';

function activeSession(): ActiveSession {
  return {
    name: 'Push A',
    planned: true,
    currentIndex: 1,
    startedAt: 123_456,
    edited: false,
    splitId: 'split-1',
    sessionId: 'day-1',
    exercises: [
      {
        sessionExerciseId: 'session-row-bench',
        exercise: {
          id: 'bench',
          name: 'Bench Press',
          muscles: [],
          axialLoad: 0.4,
          resistanceProfile: 'mid',
          unilateral: false,
        },
        targetSets: 2,
        warmupEnabled: true,
        warmupCompleted: true,
        warmupBypassed: false,
        completedSets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 190, reps: 7, rir: 1 },
        ],
        notes: 'Keep shoulder blades set',
      },
      {
        sessionExerciseId: 'session-row-row',
        exercise: {
          id: 'row',
          name: 'Chest-supported Row',
          muscles: [],
          axialLoad: 0.2,
          resistanceProfile: 'ascending',
          unilateral: false,
        },
        targetSets: 1,
        warmupEnabled: false,
        warmupCompleted: false,
        warmupBypassed: false,
        completedSets: [{ weight: 120, reps: 10 }],
        notes: 'Pause at the top',
      },
    ],
  };
}

describe('completed-set editing', () => {
  it('replaces only the targeted record while preserving workout shape and identity', () => {
    const original = activeSession();
    const untouchedExercise = original.exercises[1];
    const result = editCompletedSetInSession(
      original,
      'session-row-bench',
      1,
      { weight: 195, reps: 6, rir: 0 }
    );

    expect(result).not.toBeNull();
    expect(result?.changed).toBe(true);
    expect(result?.updatesLastUsed).toBe(true);
    expect(result?.record).toEqual({ weight: 195, reps: 6, rir: 0 });
    expect(result?.session).toMatchObject({
      name: 'Push A',
      currentIndex: 1,
      startedAt: 123_456,
      edited: false,
      splitId: 'split-1',
      sessionId: 'day-1',
    });
    expect(result?.session.exercises).toHaveLength(2);
    expect(result?.session.exercises[0]).toMatchObject({
      sessionExerciseId: 'session-row-bench',
      targetSets: 2,
      notes: 'Keep shoulder blades set',
    });
    expect(result?.session.exercises[0].exercise).toBe(original.exercises[0].exercise);
    expect(result?.session.exercises[0].completedSets).toHaveLength(2);
    expect(result?.session.exercises[0].completedSets[0]).toBe(
      original.exercises[0].completedSets[0]
    );
    expect(result?.session.exercises[1]).toBe(untouchedExercise);
    expect(original.exercises[0].completedSets[1]).toEqual({
      weight: 190,
      reps: 7,
      rir: 1,
    });
  });

  it('updates lastUsed only for the newest completed set in the row', () => {
    const original = activeSession();
    const earlier = editCompletedSetInSession(
      original,
      'session-row-bench',
      0,
      { weight: 180 }
    );
    const shadows: Record<string, SetRecord> = {
      bench: { weight: 190, reps: 7, rir: 1 },
      row: { weight: 120, reps: 10 },
    };

    expect(earlier?.updatesLastUsed).toBe(false);
    expect(lastUsedAfterCompletedSetEdit(shadows, earlier!)).toBe(shadows);

    const latest = editCompletedSetInSession(
      original,
      'session-row-bench',
      1,
      { reps: 9 }
    );
    const nextShadows = lastUsedAfterCompletedSetEdit(shadows, latest!);
    expect(nextShadows).not.toBe(shadows);
    expect(nextShadows).toEqual({
      bench: { weight: 190, reps: 9, rir: 1 },
      row: { weight: 120, reps: 10 },
    });
  });

  it('keeps the star on the truly latest duplicate block after editing older work', () => {
    const original = activeSession();
    const first = {
      ...original.exercises[0],
      sessionExerciseId: 'pushdown-set-1',
      exercise: { ...original.exercises[0].exercise, id: 'pushdown', name: 'Pushdown' },
      targetSets: 1,
      completedSets: [{ weight: 100, reps: 12 }],
      lastCompletedAt: 1000,
    };
    const second = {
      ...first,
      sessionExerciseId: 'pushdown-set-2',
      completedSets: [{ weight: 120, reps: 10 }],
      lastCompletedAt: 2000,
    };
    // Reordering cannot change which accepted set was recorded most recently.
    const session: ActiveSession = {
      ...original,
      exercises: [second, first],
    };
    const shadows: Record<string, SetRecord> = {
      pushdown: { weight: 120, reps: 10 },
    };

    const older = editCompletedSetInSession(session, 'pushdown-set-1', 0, {
      weight: 105,
    });
    expect(older?.updatesLastUsed).toBe(false);
    expect(lastUsedAfterCompletedSetEdit(shadows, older!)).toBe(shadows);

    const latest = editCompletedSetInSession(session, 'pushdown-set-2', 0, {
      weight: 125,
    });
    expect(latest?.updatesLastUsed).toBe(true);
    expect(lastUsedAfterCompletedSetEdit(shadows, latest!)).toEqual({
      pushdown: { weight: 125, reps: 10 },
    });
  });

  it('can explicitly clear RIR and accepts an unchanged latest set', () => {
    const original = activeSession();
    const cleared = editCompletedSetInSession(
      original,
      'session-row-bench',
      1,
      { rir: undefined }
    );
    expect(cleared?.record).toEqual({ weight: 190, reps: 7 });

    const unchanged = editCompletedSetInSession(
      original,
      'session-row-bench',
      1,
      { weight: 190 }
    );
    expect(unchanged).toMatchObject({ changed: false, updatesLastUsed: true });
    expect(unchanged?.session).toBe(original);
  });

  it.each([
    ['missing row', 'missing', 0, { weight: 100 }],
    ['negative index', 'session-row-bench', -1, { weight: 100 }],
    ['fractional index', 'session-row-bench', 0.5, { weight: 100 }],
    ['past final set', 'session-row-bench', 2, { weight: 100 }],
    ['empty update', 'session-row-bench', 0, {}],
    ['unknown field', 'session-row-bench', 0, { effort: 3 }],
    ['negative weight', 'session-row-bench', 0, { weight: -1 }],
    ['non-finite weight', 'session-row-bench', 0, { weight: Number.NaN }],
    ['excessive weight', 'session-row-bench', 0, { weight: 10_000 }],
    ['zero reps', 'session-row-bench', 0, { reps: 0 }],
    ['fractional reps', 'session-row-bench', 0, { reps: 7.5 }],
    ['excessive reps', 'session-row-bench', 0, { reps: 1_000 }],
    ['negative RIR', 'session-row-bench', 0, { rir: -1 }],
    ['fractional RIR', 'session-row-bench', 0, { rir: 1.5 }],
    ['excessive RIR', 'session-row-bench', 0, { rir: 6 }],
  ])('rejects %s', (_label, sessionExerciseId, setIndex, update) => {
    const original = activeSession();
    expect(
      editCompletedSetInSession(
        original,
        sessionExerciseId as string,
        setIndex as number,
        update as Partial<SetRecord>
      )
    ).toBeNull();
  });
});
