import {
  moveSessionBrowseStep,
  sessionBrowseSteps,
  type SessionBrowseExercise,
} from '../src/workout/sessionBrowse';

function exercise(
  id: string,
  overrides: Partial<SessionBrowseExercise> = {}
): SessionBrowseExercise {
  return {
    sessionExerciseId: id,
    targetSets: 3,
    completedSets: [],
    warmupEnabled: false,
    warmupCompleted: false,
    warmupBypassed: false,
    ...overrides,
  };
}

describe('session arrow browsing', () => {
  it('places each pending warmup directly before its own working page', () => {
    const steps = sessionBrowseSteps([
      exercise('bench', { warmupEnabled: true }),
      exercise('row'),
      exercise('curl', { warmupEnabled: true }),
    ]);

    expect(steps).toEqual([
      { sessionExerciseId: 'bench', kind: 'warmup' },
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 0 },
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 1 },
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 2 },
      { sessionExerciseId: 'row', kind: 'working', setIndex: 0 },
      { sessionExerciseId: 'row', kind: 'working', setIndex: 1 },
      { sessionExerciseId: 'row', kind: 'working', setIndex: 2 },
      { sessionExerciseId: 'curl', kind: 'warmup' },
      { sessionExerciseId: 'curl', kind: 'working', setIndex: 0 },
      { sessionExerciseId: 'curl', kind: 'working', setIndex: 1 },
      { sessionExerciseId: 'curl', kind: 'working', setIndex: 2 },
    ]);
  });

  it.each([
    ['completed', { warmupEnabled: true, warmupCompleted: true }],
    ['bypassed', { warmupEnabled: true, warmupBypassed: true }],
  ])('does not expose a %s warmup page', (_label, overrides) => {
    expect(sessionBrowseSteps([exercise('bench', overrides)])).toEqual([
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 0 },
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 1 },
      { sessionExerciseId: 'bench', kind: 'working', setIndex: 2 },
    ]);
  });

  it('exposes a newly enabled warmup even after working sets begin or finish', () => {
    const steps = sessionBrowseSteps([
      exercise('working', { warmupEnabled: true, completedSets: [{}] }),
      exercise('completed', {
        warmupEnabled: true,
        completedSets: [{}, {}, {}],
      }),
    ]);

    expect(steps[0]).toEqual({ sessionExerciseId: 'working', kind: 'warmup' });
    expect(steps[4]).toEqual({ sessionExerciseId: 'completed', kind: 'warmup' });
  });

  it('omits invalid zero-set rows so warmups never become counted work', () => {
    expect(
      sessionBrowseSteps([
        exercise('zero', { targetSets: 0, warmupEnabled: true }),
        exercise('valid'),
      ])
    ).toEqual([
      { sessionExerciseId: 'valid', kind: 'working', setIndex: 0 },
      { sessionExerciseId: 'valid', kind: 'working', setIndex: 1 },
      { sessionExerciseId: 'valid', kind: 'working', setIndex: 2 },
    ]);
  });

  it('moves through every warmup and working-set page in both directions', () => {
    const steps = sessionBrowseSteps([
      exercise('bench', { warmupEnabled: true }),
      exercise('row', { warmupEnabled: true }),
    ]);
    expect(moveSessionBrowseStep(steps, steps[0], 1)).toEqual(steps[1]);
    expect(moveSessionBrowseStep(steps, steps[1], 1)).toEqual(steps[2]);
    expect(moveSessionBrowseStep(steps, steps[2], -1)).toEqual(steps[1]);
    expect(moveSessionBrowseStep(steps, steps[3], 1)).toEqual(steps[4]);
    expect(moveSessionBrowseStep(steps, steps[4], -1)).toEqual(steps[3]);
  });

  it('stops at bounds and can return from an end sentinel', () => {
    const steps = sessionBrowseSteps([exercise('bench', { targetSets: 1 })]);
    expect(moveSessionBrowseStep(steps, steps[0], -1)).toBeNull();
    expect(moveSessionBrowseStep(steps, steps[0], 1)).toBeNull();
    expect(moveSessionBrowseStep(steps, null, -1)).toEqual(steps[0]);
    expect(moveSessionBrowseStep(steps, null, 1)).toBeNull();
  });

  it('fails closed for a stale cursor', () => {
    const steps = sessionBrowseSteps([exercise('bench')]);
    expect(
      moveSessionBrowseStep(
        steps,
        { sessionExerciseId: 'removed', kind: 'working', setIndex: 0 },
        1
      )
    ).toBeNull();
  });
});
