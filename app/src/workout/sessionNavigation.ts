/** The small portion of a session exercise needed to decide navigation. */
export interface ExerciseProgress {
  readonly targetSets: number;
  readonly completedSets: readonly unknown[];
}

function normalizedExerciseCount(exerciseCount: number): number {
  if (!Number.isFinite(exerciseCount)) return 0;
  return Math.max(0, Math.trunc(exerciseCount));
}

function targetSetCount(exercise: ExerciseProgress): number {
  if (!Number.isFinite(exercise.targetSets)) return 0;
  return Math.max(0, Math.trunc(exercise.targetSets));
}

function isComplete(
  exercise: ExerciseProgress,
  exerciseIndex: number,
  extraCompletedSetIndex?: number | null
): boolean {
  const completedSets =
    exercise.completedSets.length + (exerciseIndex === extraCompletedSetIndex ? 1 : 0);
  return completedSets >= targetSetCount(exercise);
}

/**
 * Moves one exercise at a time while keeping the index between the first
 * exercise and the end-of-session sentinel (`exerciseCount`).
 */
export function moveSessionExerciseIndex(
  currentIndex: number,
  exerciseCount: number,
  direction: -1 | 1
): number {
  const count = normalizedExerciseCount(exerciseCount);
  if (count === 0) return 0;

  const safeIndex = Number.isFinite(currentIndex)
    ? Math.min(count, Math.max(0, Math.trunc(currentIndex)))
    : 0;

  return Math.min(count, Math.max(0, safeIndex + direction));
}

/**
 * Finds the next unfinished exercise after `fromIndex`, wrapping to the
 * beginning when necessary. The optional index treats one set as already
 * completed, which is useful while that set is still pending a state commit.
 */
export function nextIncompleteExerciseIndex(
  exercises: readonly ExerciseProgress[],
  fromIndex: number,
  extraCompletedSetIndex?: number | null
): number {
  const count = exercises.length;
  if (count === 0) return 0;

  const safeFromIndex =
    Number.isInteger(fromIndex) && fromIndex >= 0 && fromIndex < count ? fromIndex : -1;
  const safeExtraIndex =
    Number.isInteger(extraCompletedSetIndex) &&
    (extraCompletedSetIndex as number) >= 0 &&
    (extraCompletedSetIndex as number) < count
      ? extraCompletedSetIndex
      : null;

  for (let offset = 1; offset <= count; offset += 1) {
    const index = (safeFromIndex + offset) % count;
    if (!isComplete(exercises[index], index, safeExtraIndex)) return index;
  }

  return count;
}

/** Returns whether recording one set at `index` would finish every exercise. */
export function sessionWillBeCompleteAfterSet(
  exercises: readonly ExerciseProgress[],
  index: number
): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= exercises.length) return false;
  return exercises.every((exercise, exerciseIndex) => isComplete(exercise, exerciseIndex, index));
}
