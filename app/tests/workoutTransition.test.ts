import { registerTransitionHandler, triggerExpandTransition } from '../src/utils/workoutTransition';

describe('workout transition handler registry', () => {
  afterEach(() => {
    registerTransitionHandler(() => {})();
  });

  it('only unregisters the handler that created the cleanup callback', () => {
    const calls: string[] = [];
    const unregisterFirst = registerTransitionHandler(() => calls.push('first'));
    triggerExpandTransition();

    const unregisterSecond = registerTransitionHandler(() => calls.push('second'));
    unregisterFirst();
    triggerExpandTransition();

    unregisterSecond();
    triggerExpandTransition();

    expect(calls).toEqual(['first', 'second']);
  });
});
