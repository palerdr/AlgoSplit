import {
  chainWarmupPending,
  currentSessionStep,
  nextSessionStepAfterCompletion,
  restSecondsBeforeSessionStep,
  type SessionChainExercise,
} from '../src/workout/sessionChain';

function row(
  sessionExerciseId: string,
  overrides: Partial<SessionChainExercise> = {}
): SessionChainExercise {
  return {
    sessionExerciseId,
    targetSets: 3,
    completedSets: [],
    warmupEnabled: false,
    warmupCompleted: false,
    warmupBypassed: false,
    ...overrides,
  };
}

describe('session step chain', () => {
  it('starts directly on a pending warmup without inventing an initial rest', () => {
    const exercises = [row('bench', { warmupEnabled: true })];
    expect(currentSessionStep(exercises, 0)).toEqual({
      kind: 'warmup',
      exerciseIndex: 0,
      sessionExerciseId: 'bench',
    });
  });

  it('gives standard rest before Set 1 after a warmup', () => {
    const exercises = [row('bench', { warmupEnabled: true })];
    const next = nextSessionStepAfterCompletion(exercises, 'bench', 'warmup');
    expect(next).toMatchObject({ kind: 'working', exerciseIndex: 0 });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(180);
  });

  it('treats a late warmup as actionable after all of its working sets are done', () => {
    const late = row('bench', {
      warmupEnabled: true,
      completedSets: [{}, {}, {}],
    });

    expect(currentSessionStep([late], 0)).toEqual({
      kind: 'warmup',
      exerciseIndex: 0,
      sessionExerciseId: 'bench',
    });
    expect(nextSessionStepAfterCompletion([late], 'bench', 'warmup')).toBeNull();
  });

  it('continues from a completed late warmup to the next actionable exercise', () => {
    const exercises = [
      row('late', { warmupEnabled: true, completedSets: [{}, {}, {}] }),
      row('row', { completedSets: [{}] }),
    ];

    expect(nextSessionStepAfterCompletion(exercises, 'late', 'warmup')).toEqual({
      kind: 'working',
      exerciseIndex: 1,
      sessionExerciseId: 'row',
    });
  });

  it('gives standard rest between working sets of the same exercise', () => {
    const exercises = [row('bench', { completedSets: [{}] })];
    const next = nextSessionStepAfterCompletion(exercises, 'bench', 'working');
    expect(next).toMatchObject({ kind: 'working', exerciseIndex: 0 });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(180);
  });

  it('gives half rest before the next exercise warmup', () => {
    const exercises = [
      row('bench', { completedSets: [{}, {}] }),
      row('row', { warmupEnabled: true }),
    ];
    const next = nextSessionStepAfterCompletion(exercises, 'bench', 'working');
    expect(next).toMatchObject({
      kind: 'warmup',
      exerciseIndex: 1,
      sessionExerciseId: 'row',
    });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(90);
  });

  it('finds a pending late warmup on an otherwise completed exercise', () => {
    const exercises = [
      row('bench', { targetSets: 1 }),
      row('late', {
        targetSets: 1,
        completedSets: [{}],
        warmupEnabled: true,
      }),
    ];
    const next = nextSessionStepAfterCompletion(exercises, 'bench', 'working');

    expect(next).toEqual({
      kind: 'warmup',
      exerciseIndex: 1,
      sessionExerciseId: 'late',
    });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(90);
  });

  it.each([
    ['off', row('row')],
    ['completed', row('row', { warmupEnabled: true, warmupCompleted: true })],
    ['bypassed', row('row', { warmupEnabled: true, warmupBypassed: true })],
  ])('goes to working sets with standard rest when the warmup is %s', (_, nextRow) => {
    const exercises = [row('bench', { completedSets: [{}, {}] }), nextRow];
    const next = nextSessionStepAfterCompletion(exercises, 'bench', 'working');
    expect(next).toMatchObject({ kind: 'working', exerciseIndex: 1 });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(180);
  });

  it('wraps to an earlier unfinished row and honors its pending warmup', () => {
    const exercises = [
      row('skipped', { warmupEnabled: true }),
      row('middle', { completedSets: [{}, {}, {}] }),
      row('last', { completedSets: [{}, {}] }),
    ];
    const next = nextSessionStepAfterCompletion(exercises, 'last', 'working');
    expect(next).toMatchObject({ kind: 'warmup', exerciseIndex: 0 });
    expect(restSecondsBeforeSessionStep(next!, 180)).toBe(90);
  });

  it('returns no destination or timer after the final outstanding working set', () => {
    const exercises = [row('bench', { targetSets: 1 })];
    expect(nextSessionStepAfterCompletion(exercises, 'bench', 'working')).toBeNull();
  });

  it('does not create an orphan warmup for a zero-set row', () => {
    const orphan = row('orphan', { targetSets: 0, warmupEnabled: true });
    expect(chainWarmupPending(orphan)).toBe(false);
    expect(currentSessionStep([orphan], 0)).toBeNull();
  });
});
