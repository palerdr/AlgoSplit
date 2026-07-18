import { nextIncompleteExerciseIndex } from './sessionNavigation';
import { sessionWarmupPending } from './sessionState';

export type SessionStepKind = 'warmup' | 'working';

export interface SessionChainExercise {
  sessionExerciseId: string;
  targetSets: number;
  completedSets: readonly unknown[];
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  warmupBypassed: boolean;
}

export interface SessionStep {
  kind: SessionStepKind;
  exerciseIndex: number;
  sessionExerciseId: string;
}

function normalizedTargetSets(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function chainWarmupPending(exercise: SessionChainExercise): boolean {
  return sessionWarmupPending(exercise);
}

export function currentSessionStep(
  exercises: readonly SessionChainExercise[],
  exerciseIndex: number
): SessionStep | null {
  const exercise = exercises[exerciseIndex];
  if (!exercise) return null;
  if (chainWarmupPending(exercise)) {
    return {
      kind: 'warmup',
      exerciseIndex,
      sessionExerciseId: exercise.sessionExerciseId,
    };
  }
  if (exercise.completedSets.length < normalizedTargetSets(exercise.targetSets)) {
    return {
      kind: 'working',
      exerciseIndex,
      sessionExerciseId: exercise.sessionExerciseId,
    };
  }
  return null;
}

/**
 * Project the destination after one accepted step without mutating session
 * state. Rest duration is selected from this destination, never the outgoing
 * step: warmup destinations get half rest; working destinations get standard.
 */
export function nextSessionStepAfterCompletion(
  exercises: readonly SessionChainExercise[],
  sourceSessionExerciseId: string,
  completedKind: SessionStepKind
): SessionStep | null {
  const exerciseIndex = exercises.findIndex(
    (exercise) => exercise.sessionExerciseId === sourceSessionExerciseId
  );
  const exercise = exercises[exerciseIndex];
  if (!exercise) return null;

  if (completedKind === 'warmup') {
    if (exercise.completedSets.length < normalizedTargetSets(exercise.targetSets)) {
      return {
        kind: 'working',
        exerciseIndex,
        sessionExerciseId: exercise.sessionExerciseId,
      };
    }
    return null;
  }

  const completedAfterCommit = exercise.completedSets.length + 1;
  if (completedAfterCommit < normalizedTargetSets(exercise.targetSets)) {
    return {
      kind: 'working',
      exerciseIndex,
      sessionExerciseId: exercise.sessionExerciseId,
    };
  }

  const nextIndex = nextIncompleteExerciseIndex(
    exercises,
    exerciseIndex,
    exerciseIndex
  );
  if (nextIndex >= exercises.length) return null;
  const next = exercises[nextIndex];
  return {
    kind: chainWarmupPending(next) ? 'warmup' : 'working',
    exerciseIndex: nextIndex,
    sessionExerciseId: next.sessionExerciseId,
  };
}

export function restSecondsBeforeSessionStep(
  step: SessionStep,
  standardSeconds: number
): number {
  const normalizedStandard = Number.isFinite(standardSeconds)
    ? Math.max(1, Math.round(standardSeconds))
    : 1;
  return step.kind === 'warmup'
    ? Math.max(1, Math.round(normalizedStandard / 2))
    : normalizedStandard;
}
