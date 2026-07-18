/** One row in the optional setup shown before a planned workout starts. */
export interface PlannedSessionExercisePreparation {
  /** Index in the saved workout before the user reorders it for this session. */
  sourceIndex: number;
  warmupEnabled: boolean;
}

export type PlannedSessionPreparation = readonly PlannedSessionExercisePreparation[];

export interface PreparedPlannedExercise<T> {
  sourceIndex: number;
  value: T;
  warmupEnabled: boolean;
}

/**
 * Apply a session-only order/warmup setup without ever dropping a saved
 * exercise. Invalid and duplicate rows are ignored; omitted rows are appended
 * in their original order with warmups off.
 */
export function preparePlannedSessionExercises<T>(
  source: readonly T[],
  preparation?: PlannedSessionPreparation
): PreparedPlannedExercise<T>[] {
  const seen = new Set<number>();
  const prepared: PreparedPlannedExercise<T>[] = [];

  for (const row of preparation ?? []) {
    if (
      !Number.isInteger(row.sourceIndex) ||
      row.sourceIndex < 0 ||
      row.sourceIndex >= source.length ||
      seen.has(row.sourceIndex)
    ) {
      continue;
    }
    seen.add(row.sourceIndex);
    prepared.push({
      sourceIndex: row.sourceIndex,
      value: source[row.sourceIndex],
      warmupEnabled: row.warmupEnabled === true,
    });
  }

  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    if (seen.has(sourceIndex)) continue;
    prepared.push({
      sourceIndex,
      value: source[sourceIndex],
      warmupEnabled: false,
    });
  }

  return prepared;
}

export interface StableSessionExercise {
  sessionExerciseId: string;
}

export interface SessionExerciseOrderResult<T extends StableSessionExercise> {
  exercises: T[];
  currentIndex: number;
  changed: boolean;
}

/** Resolve a row without relying on its mutable array position. */
export function sessionExerciseIndexById(
  exercises: readonly StableSessionExercise[],
  sessionExerciseId: string
): number {
  if (!sessionExerciseId) return -1;
  return exercises.findIndex((exercise) => exercise.sessionExerciseId === sessionExerciseId);
}

/**
 * Reorder only when `orderedIds` is an exact permutation. The current viewport
 * follows the same exercise identity, including when duplicate catalog
 * exercises exist in one workout.
 */
export function reorderSessionExercisesById<T extends StableSessionExercise>(
  exercises: readonly T[],
  currentIndex: number,
  orderedIds: readonly string[]
): SessionExerciseOrderResult<T> {
  if (orderedIds.length !== exercises.length) {
    return { exercises: [...exercises], currentIndex, changed: false };
  }

  const byId = new Map(exercises.map((exercise) => [exercise.sessionExerciseId, exercise]));
  if (byId.size !== exercises.length || new Set(orderedIds).size !== orderedIds.length) {
    return { exercises: [...exercises], currentIndex, changed: false };
  }

  const reordered: T[] = [];
  for (const id of orderedIds) {
    const exercise = byId.get(id);
    if (!exercise) return { exercises: [...exercises], currentIndex, changed: false };
    reordered.push(exercise);
  }

  const changed = reordered.some((exercise, index) => exercise !== exercises[index]);
  if (!changed) return { exercises: [...exercises], currentIndex, changed: false };

  // `exercises.length` is the existing end-of-workout sentinel.
  if (currentIndex >= exercises.length) {
    return { exercises: reordered, currentIndex: reordered.length, changed: true };
  }
  const currentId = exercises[currentIndex]?.sessionExerciseId;
  const nextCurrentIndex = currentId
    ? sessionExerciseIndexById(reordered, currentId)
    : Math.min(Math.max(0, currentIndex), Math.max(0, reordered.length - 1));
  return {
    exercises: reordered,
    currentIndex: nextCurrentIndex < 0 ? 0 : nextCurrentIndex,
    changed: true,
  };
}

export interface WarmupSessionExercise extends StableSessionExercise {
  targetSets: number;
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  /** A deliberate in-workout list jump can skip this session-only warmup. */
  warmupBypassed: boolean;
  completedSets: readonly unknown[];
}

/** Warmup choice becomes immutable as soon as any set for the row has begun. */
export function canChangeSessionWarmup(exercise: WarmupSessionExercise): boolean {
  return (
    Number.isInteger(exercise.targetSets) &&
    exercise.targetSets > 0 &&
    !exercise.warmupCompleted &&
    !exercise.warmupBypassed &&
    exercise.completedSets.length === 0
  );
}

/** True only while the session must show this warmup before automatic work. */
export function sessionWarmupPending(exercise: WarmupSessionExercise): boolean {
  return (
    Number.isInteger(exercise.targetSets) &&
    exercise.targetSets > 0 &&
    exercise.warmupEnabled &&
    !exercise.warmupCompleted &&
    !exercise.warmupBypassed &&
    exercise.completedSets.length === 0
  );
}

export function setSessionWarmupEnabledById<
  TExercise extends WarmupSessionExercise,
>(
  exercises: readonly TExercise[],
  sessionExerciseId: string,
  enabled: boolean
): TExercise[] {
  let changed = false;
  const next = exercises.map((exercise) => {
    if (
      exercise.sessionExerciseId !== sessionExerciseId ||
      !canChangeSessionWarmup(exercise) ||
      exercise.warmupEnabled === enabled
    ) {
      return exercise;
    }
    changed = true;
    return { ...exercise, warmupEnabled: enabled } as TExercise;
  });
  return changed ? next : [...exercises];
}

/**
 * Mark the one optional warmup complete without storing load/reps/RIR or
 * touching the working-set collection. A disabled, repeated, or late warmup
 * is deliberately a no-op.
 */
export function completeSessionWarmupById<
  TExercise extends WarmupSessionExercise,
>(
  exercises: readonly TExercise[],
  sessionExerciseId: string
): TExercise[] {
  let changed = false;
  const next = exercises.map((exercise) => {
    if (
      exercise.sessionExerciseId !== sessionExerciseId ||
      !sessionWarmupPending(exercise)
    ) {
      return exercise;
    }
    changed = true;
    return { ...exercise, warmupCompleted: true } as TExercise;
  });
  return changed ? next : [...exercises];
}

/**
 * A row chosen explicitly from the live order menu opens at its working sets.
 * This resolves only that row's pending warmup and remains completely outside
 * working-set records and metrics.
 */
export function bypassSessionWarmupById<
  TExercise extends WarmupSessionExercise,
>(
  exercises: readonly TExercise[],
  sessionExerciseId: string
): TExercise[] {
  let changed = false;
  const next = exercises.map((exercise) => {
    if (
      exercise.sessionExerciseId !== sessionExerciseId ||
      !sessionWarmupPending(exercise)
    ) {
      return exercise;
    }
    changed = true;
    return { ...exercise, warmupBypassed: true } as TExercise;
  });
  return changed ? next : [...exercises];
}

export interface SessionExerciseJumpResult<TExercise extends StableSessionExercise> {
  exercises: TExercise[];
  currentIndex: number;
  changed: boolean;
}

/** Resolve selection and an optional manual warmup bypass as one transaction. */
export function jumpToSessionExerciseById<
  TExercise extends WarmupSessionExercise,
>(
  exercises: readonly TExercise[],
  currentIndex: number,
  sessionExerciseId: string,
  options?: { bypassWarmup?: boolean }
): SessionExerciseJumpResult<TExercise> {
  const nextIndex = sessionExerciseIndexById(exercises, sessionExerciseId);
  if (nextIndex < 0) {
    return { exercises: [...exercises], currentIndex, changed: false };
  }
  const shouldBypass = options?.bypassWarmup && nextIndex !== currentIndex;
  const nextExercises = shouldBypass
    ? bypassSessionWarmupById(exercises, sessionExerciseId)
    : [...exercises];
  const changedExercise = nextExercises.some(
    (exercise, index) => exercise !== exercises[index]
  );
  return {
    exercises: nextExercises,
    currentIndex: nextIndex,
    changed: nextIndex !== currentIndex || changedExercise,
  };
}
