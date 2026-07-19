import { sessionWarmupPending } from './sessionState';

export type SessionBrowseStepKind = 'warmup' | 'working';

export interface SessionBrowseExercise {
  sessionExerciseId: string;
  targetSets: number;
  completedSets: readonly unknown[];
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  warmupBypassed: boolean;
}

export type SessionBrowseStep =
  | {
      sessionExerciseId: string;
      kind: 'warmup';
    }
  | {
      sessionExerciseId: string;
      kind: 'working';
      /** Zero-based working-set position; warmups never occupy an index. */
      setIndex: number;
    };

export function sameSessionBrowseStep(
  left: SessionBrowseStep | null | undefined,
  right: SessionBrowseStep | null | undefined
): boolean {
  return Boolean(
    left &&
      right &&
      left.sessionExerciseId === right.sessionExerciseId &&
      left.kind === right.kind &&
      (left.kind !== 'working' ||
        (right.kind === 'working' && left.setIndex === right.setIndex))
  );
}

/**
 * Pages exposed by the in-session arrows. A checked, unresolved warmup is a
 * page immediately before that exercise's working-set pages; it is never a
 * counted set, never consumes a set index, and disappears once completed or
 * explicitly bypassed.
 */
export function sessionBrowseSteps(
  exercises: readonly SessionBrowseExercise[]
): SessionBrowseStep[] {
  return exercises.flatMap((exercise) => {
    if (!Number.isInteger(exercise.targetSets) || exercise.targetSets < 1) return [];
    const working: SessionBrowseStep[] = Array.from(
      { length: exercise.targetSets },
      (_, setIndex) => ({
        sessionExerciseId: exercise.sessionExerciseId,
        kind: 'working' as const,
        setIndex,
      })
    );
    return sessionWarmupPending(exercise)
      ? [
          {
            sessionExerciseId: exercise.sessionExerciseId,
            kind: 'warmup' as const,
          },
          ...working,
        ]
      : working;
  });
}

/** Move one visible warmup/working page without mutating workout progress. */
export function moveSessionBrowseStep(
  steps: readonly SessionBrowseStep[],
  current: SessionBrowseStep | null | undefined,
  direction: -1 | 1
): SessionBrowseStep | null {
  if (steps.length === 0) return null;
  const currentIndex = current
    ? steps.findIndex((step) => sameSessionBrowseStep(step, current))
    : steps.length;
  if (current && currentIndex < 0) return null;
  const nextIndex = currentIndex + direction;
  return nextIndex >= 0 && nextIndex < steps.length ? steps[nextIndex] : null;
}
