import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockAsyncStorage = require(
  '@react-native-async-storage/async-storage/jest/async-storage-mock'
) as { clear: () => Promise<unknown> };

jest.mock('../src/state/AccountState', () => ({
  useAccountState: () => ({
    status: 'unconfigured',
    user: null,
    refreshWorkouts: jest.fn(async () => undefined),
    refreshStimulus: jest.fn(async () => undefined),
    refreshSession: jest.fn(async () => undefined),
  }),
}));

import { EXERCISES } from '../src/data/exercises';
import {
  AppStateProvider,
  useAppState,
} from '../src/state/AppState';
import type { AccountWorkoutPlan } from '../src/workout/splitSessions';
import { sessionWarmupPending } from '../src/workout/sessionState';

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void };
};

let currentState!: ReturnType<typeof useAppState>;

function Probe() {
  currentState = useAppState();
  return null;
}

function plan(sets: number[]): AccountWorkoutPlan {
  return {
    kind: 'workout',
    id: 'split-1:day-1',
    splitId: 'split-1',
    splitName: 'Upper',
    sessionId: 'day-1',
    name: 'Upper A',
    dayNumber: 1,
    exercises: sets.map((count, index) => ({
      exercise: EXERCISES[index],
      sets: count,
    })),
  };
}

describe('AppState live session integration', () => {
  beforeEach(async () => {
    await mockAsyncStorage.clear();
  });

  it('starts planned work as one stable live block per prescribed set', async () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AppStateProvider, null, React.createElement(Probe))
      );
      await Promise.resolve();
    });

    await TestRenderer.act(async () => {
      currentState.startPlannedSession(plan([3, 2]));
    });

    expect(currentState.session?.exercises).toHaveLength(5);
    expect(currentState.session?.exercises.map((exercise) => exercise.targetSets)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(new Set(
      currentState.session?.exercises.map((exercise) => exercise.sessionExerciseId)
    ).size).toBe(5);
    await TestRenderer.act(async () => renderer!.unmount());
  });

  it('lands on an injected late warmup and advances after it completes', async () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AppStateProvider, null, React.createElement(Probe))
      );
      await Promise.resolve();
    });
    await TestRenderer.act(async () => currentState.startPlannedSession(plan([1, 1])));

    const first = currentState.session!.exercises[0];
    const second = currentState.session!.exercises[1];
    await TestRenderer.act(async () => {
      currentState.completeSet(
        { weight: 100, reps: 10 },
        {
          exerciseIndex: 0,
          exerciseId: first.exercise.id,
          sessionExerciseId: first.sessionExerciseId,
          kind: 'working',
        }
      );
      currentState.setSessionExerciseWarmupEnabled(first.sessionExerciseId, true);
      currentState.completeSet(
        { weight: 80, reps: 12 },
        {
          exerciseIndex: 1,
          exerciseId: second.exercise.id,
          sessionExerciseId: second.sessionExerciseId,
          kind: 'working',
        }
      );
    });

    expect(currentState.session?.currentIndex).toBe(0);
    expect(sessionWarmupPending(currentState.session!.exercises[0])).toBe(true);

    await TestRenderer.act(async () => {
      currentState.completeWarmupSet({
        exerciseIndex: 0,
        exerciseId: first.exercise.id,
        sessionExerciseId: first.sessionExerciseId,
        kind: 'warmup',
      });
    });

    expect(currentState.session?.exercises[0].warmupCompleted).toBe(true);
    expect(currentState.session?.currentIndex).toBe(2);
    await TestRenderer.act(async () => renderer!.unmount());
  });

  it('updates the exercise-global last weight midway without older edits stealing it', async () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AppStateProvider, null, React.createElement(Probe))
      );
      await Promise.resolve();
    });
    await TestRenderer.act(async () => currentState.startPlannedSession(plan([2])));

    const first = currentState.session!.exercises[0];
    const second = currentState.session!.exercises[1];
    await TestRenderer.act(async () => {
      currentState.completeSet(
        { weight: 100, reps: 12 },
        {
          exerciseIndex: 0,
          exerciseId: first.exercise.id,
          sessionExerciseId: first.sessionExerciseId,
          kind: 'working',
        }
      );
    });
    expect(currentState.lastUsed[first.exercise.id]).toEqual({ weight: 100, reps: 12 });

    await TestRenderer.act(async () => {
      currentState.completeSet(
        { weight: 120, reps: 10 },
        {
          exerciseIndex: 1,
          exerciseId: second.exercise.id,
          sessionExerciseId: second.sessionExerciseId,
          kind: 'working',
        }
      );
    });
    expect(currentState.lastUsed[first.exercise.id]).toEqual({ weight: 120, reps: 10 });

    await TestRenderer.act(async () => {
      currentState.reorderSessionExercises([
        second.sessionExerciseId,
        first.sessionExerciseId,
      ]);
      currentState.updateCompletedSet(first.sessionExerciseId, 0, { weight: 105 });
    });
    expect(currentState.lastUsed[first.exercise.id]).toEqual({ weight: 120, reps: 10 });
    await TestRenderer.act(async () => renderer!.unmount());
  });

  it('treats selecting the same exercise in the swap picker as a no-op', async () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AppStateProvider, null, React.createElement(Probe))
      );
      await Promise.resolve();
    });
    await TestRenderer.act(async () => currentState.startPlannedSession(plan([2])));
    const before = currentState.session!;
    const first = before.exercises[0];

    await TestRenderer.act(async () => currentState.editExercise(0, first.exercise));
    expect(currentState.session).toBe(before);

    await TestRenderer.act(async () => {
      currentState.completeSet(
        { weight: 100, reps: 10 },
        {
          exerciseIndex: 0,
          exerciseId: first.exercise.id,
          sessionExerciseId: first.sessionExerciseId,
          kind: 'working',
        }
      );
    });
    const completed = currentState.session!;
    await TestRenderer.act(async () => currentState.editExercise(0, first.exercise));
    expect(currentState.session).toBe(completed);
    expect(currentState.session?.exercises).toHaveLength(2);
    await TestRenderer.act(async () => renderer!.unmount());
  });
});
