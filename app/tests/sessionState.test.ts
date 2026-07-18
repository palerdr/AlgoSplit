import {
  bypassSessionWarmupById,
  canChangeSessionWarmup,
  completeSessionWarmupById,
  jumpToSessionExerciseById,
  preparePlannedSessionExercises,
  reorderSessionExercisesById,
  sessionExerciseIndexById,
  sessionWarmupPending,
  setSessionWarmupEnabledById,
} from '../src/workout/sessionState';
import { nextIncompleteExerciseIndex } from '../src/workout/sessionNavigation';

interface Row {
  sessionExerciseId: string;
  catalogId: string;
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  warmupBypassed: boolean;
  completedSets: { weight: number; reps: number }[];
  targetSets: number;
}

function row(
  sessionExerciseId: string,
  overrides: Partial<Row> = {}
): Row {
  return {
    sessionExerciseId,
    catalogId: sessionExerciseId,
    warmupEnabled: false,
    warmupCompleted: false,
    warmupBypassed: false,
    completedSets: [],
    targetSets: 3,
    ...overrides,
  };
}

describe('planned-session preparation', () => {
  it('uses source indexes for order and warmups without dropping omitted exercises', () => {
    const source = ['Bench', 'Row', 'Curl'];
    expect(
      preparePlannedSessionExercises(source, [
        { sourceIndex: 2, warmupEnabled: true },
        { sourceIndex: 0, warmupEnabled: false },
      ])
    ).toEqual([
      { sourceIndex: 2, value: 'Curl', warmupEnabled: true },
      { sourceIndex: 0, value: 'Bench', warmupEnabled: false },
      { sourceIndex: 1, value: 'Row', warmupEnabled: false },
    ]);
  });

  it('ignores invalid and duplicate preparation rows safely', () => {
    expect(
      preparePlannedSessionExercises(['Bench', 'Row'], [
        { sourceIndex: 1, warmupEnabled: true },
        { sourceIndex: 1, warmupEnabled: false },
        { sourceIndex: 99, warmupEnabled: true },
      ])
    ).toEqual([
      { sourceIndex: 1, value: 'Row', warmupEnabled: true },
      { sourceIndex: 0, value: 'Bench', warmupEnabled: false },
    ]);
  });
});

describe('live session identity and order', () => {
  it('keeps the current occurrence selected across a reorder', () => {
    // The first two deliberately share one catalog exercise identity. Session
    // row identity, not catalog identity or an old index, must win.
    const first = row('session-row-a', { catalogId: 'bench' });
    const current = row('session-row-b', { catalogId: 'bench' });
    const last = row('session-row-c', { catalogId: 'row' });
    const result = reorderSessionExercisesById(
      [first, current, last],
      1,
      ['session-row-c', 'session-row-a', 'session-row-b']
    );

    expect(result.changed).toBe(true);
    expect(result.exercises).toEqual([last, first, current]);
    expect(result.currentIndex).toBe(2);
    expect(result.exercises[result.currentIndex]).toBe(current);
    expect(sessionExerciseIndexById(result.exercises, 'session-row-b')).toBe(2);
  });

  it('preserves the end sentinel and rejects non-permutations', () => {
    const exercises = [row('a'), row('b')];
    expect(
      reorderSessionExercisesById(exercises, exercises.length, ['b', 'a'])
    ).toMatchObject({ currentIndex: 2, changed: true });
    expect(
      reorderSessionExercisesById(exercises, 0, ['a', 'missing'])
    ).toMatchObject({ exercises, currentIndex: 0, changed: false });
    expect(
      reorderSessionExercisesById(exercises, 0, ['a', 'a'])
    ).toMatchObject({ exercises, currentIndex: 0, changed: false });
  });
});

describe('warmup invariants', () => {
  it('marks one enabled warmup without recording or advancing working progress', () => {
    const untouched = row('bench', { warmupEnabled: true });
    const exercises = completeSessionWarmupById([untouched], 'bench');

    expect(exercises[0].warmupCompleted).toBe(true);
    expect(exercises[0].completedSets).toBe(untouched.completedSets);
    expect(exercises[0].completedSets).toHaveLength(0);
    expect(nextIncompleteExerciseIndex(exercises, 0)).toBe(0);

    // A second completion is ignored, so the feature can never manufacture
    // extra working sets or overwrite the first warmup.
    const repeated = completeSessionWarmupById(exercises, 'bench');
    expect(repeated[0]).toBe(exercises[0]);
    expect(repeated[0].warmupCompleted).toBe(true);
  });

  it('does not record a disabled warmup or one after working sets begin', () => {
    const disabled = row('disabled');
    const working = row('working', {
      warmupEnabled: true,
      completedSets: [{ weight: 185, reps: 8 }],
    });
    const next = completeSessionWarmupById([disabled, working], 'disabled');
    const late = completeSessionWarmupById(next, 'working');

    expect(next[0]).toBe(disabled);
    expect(late[1]).toBe(working);
    expect(late[1].warmupCompleted).toBe(false);
  });

  it('locks the checkbox after either warmup or working work begins', () => {
    const untouched = row('untouched');
    const enabled = setSessionWarmupEnabledById([untouched], 'untouched', true);
    expect(enabled[0].warmupEnabled).toBe(true);
    expect(canChangeSessionWarmup(enabled[0])).toBe(true);

    const warmed = completeSessionWarmupById(enabled, 'untouched');
    expect(canChangeSessionWarmup(warmed[0])).toBe(false);
    expect(setSessionWarmupEnabledById(warmed, 'untouched', false)[0]).toBe(warmed[0]);

    const working = row('working', {
      warmupEnabled: true,
      completedSets: [{ weight: 185, reps: 8 }],
    });
    expect(canChangeSessionWarmup(working)).toBe(false);
    expect(setSessionWarmupEnabledById([working], 'working', false)[0]).toBe(working);
  });

  it('bypasses only the explicitly selected pending warmup without logging work', () => {
    const selected = row('selected', { warmupEnabled: true });
    const later = row('later', { warmupEnabled: true });
    const exercises = bypassSessionWarmupById([selected, later], 'selected');

    expect(exercises[0]).toMatchObject({
      warmupEnabled: true,
      warmupCompleted: false,
      warmupBypassed: true,
      completedSets: [],
    });
    expect(sessionWarmupPending(exercises[0])).toBe(false);
    expect(canChangeSessionWarmup(exercises[0])).toBe(false);
    expect(exercises[1]).toBe(later);
    expect(sessionWarmupPending(exercises[1])).toBe(true);
  });

  it('selects and bypasses a pending warmup atomically for a live-list jump', () => {
    const first = row('first', { warmupEnabled: true });
    const selected = row('selected', { warmupEnabled: true });
    const result = jumpToSessionExerciseById(
      [first, selected],
      0,
      'selected',
      { bypassWarmup: true }
    );

    expect(result.changed).toBe(true);
    expect(result.currentIndex).toBe(1);
    expect(result.exercises[0]).toBe(first);
    expect(result.exercises[1]).toMatchObject({
      warmupBypassed: true,
      warmupCompleted: false,
      completedSets: [],
    });
  });

  it('keeps completed exercise rows selectable without mutating their work', () => {
    const completed = row('completed', {
      completedSets: [{ weight: 185, reps: 8 }, { weight: 185, reps: 8 }, { weight: 185, reps: 8 }],
    });
    const result = jumpToSessionExerciseById([row('current'), completed], 0, 'completed', {
      bypassWarmup: true,
    });

    expect(result.changed).toBe(true);
    expect(result.currentIndex).toBe(1);
    expect(result.exercises[1]).toBe(completed);
    expect(result.exercises[1].completedSets).toHaveLength(3);
  });

  it('does not treat tapping the already-current row as a warmup bypass', () => {
    const current = row('current', { warmupEnabled: true });
    const result = jumpToSessionExerciseById([current], 0, 'current', {
      bypassWarmup: true,
    });

    expect(result.changed).toBe(false);
    expect(result.currentIndex).toBe(0);
    expect(result.exercises[0]).toBe(current);
    expect(sessionWarmupPending(result.exercises[0])).toBe(true);
  });

  it('ignores warmups on rows with no working sets', () => {
    const orphan = row('orphan', { targetSets: 0, warmupEnabled: true });
    expect(sessionWarmupPending(orphan)).toBe(false);
    expect(completeSessionWarmupById([orphan], 'orphan')[0]).toBe(orphan);
    expect(bypassSessionWarmupById([orphan], 'orphan')[0]).toBe(orphan);
  });

  it.each([Number.NaN, Infinity, -1, 0, 2.5])(
    'does not expose a warmup for invalid target count %p',
    (targetSets) => {
      const invalid = row('invalid', { targetSets, warmupEnabled: true });
      expect(sessionWarmupPending(invalid)).toBe(false);
      expect(canChangeSessionWarmup(invalid)).toBe(false);
    }
  );
});
