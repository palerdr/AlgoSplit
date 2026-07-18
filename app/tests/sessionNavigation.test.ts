import {
  moveSessionExerciseIndex,
  nextIncompleteExerciseIndex,
  sessionWillBeCompleteAfterSet,
  type ExerciseProgress,
} from '../src/workout/sessionNavigation';

function exercise(targetSets: number, completedSets: number): ExerciseProgress {
  return {
    targetSets,
    completedSets: Array.from({ length: completedSets }),
  };
}

describe('moveSessionExerciseIndex', () => {
  it('keeps an empty session at its zero sentinel', () => {
    expect(moveSessionExerciseIndex(0, 0, -1)).toBe(0);
    expect(moveSessionExerciseIndex(0, 0, 1)).toBe(0);
  });

  it('moves in both directions and stops at the session bounds', () => {
    expect(moveSessionExerciseIndex(1, 3, -1)).toBe(0);
    expect(moveSessionExerciseIndex(1, 3, 1)).toBe(2);
    expect(moveSessionExerciseIndex(0, 3, -1)).toBe(0);
  });

  it('lets previous leave the end sentinel while next remains there', () => {
    expect(moveSessionExerciseIndex(3, 3, -1)).toBe(2);
    expect(moveSessionExerciseIndex(3, 3, 1)).toBe(3);
  });

  it('clamps invalid indexes before moving', () => {
    expect(moveSessionExerciseIndex(-20, 3, 1)).toBe(1);
    expect(moveSessionExerciseIndex(20, 3, -1)).toBe(2);
    expect(moveSessionExerciseIndex(Number.NaN, 3, -1)).toBe(0);
    expect(moveSessionExerciseIndex(1, Number.NaN, 1)).toBe(0);
  });
});

describe('nextIncompleteExerciseIndex', () => {
  it('returns the zero sentinel for an empty session', () => {
    expect(nextIncompleteExerciseIndex([], 0)).toBe(0);
  });

  it('finds the next incomplete exercise going forward', () => {
    const exercises = [exercise(2, 2), exercise(3, 1), exercise(2, 0)];
    expect(nextIncompleteExerciseIndex(exercises, 0)).toBe(1);
  });

  it('wraps to an earlier incomplete exercise that was skipped', () => {
    const exercises = [exercise(3, 1), exercise(2, 2), exercise(1, 1)];
    expect(nextIncompleteExerciseIndex(exercises, 2)).toBe(0);
  });

  it('accounts for a set that has not yet been committed', () => {
    const exercises = [exercise(2, 2), exercise(1, 0), exercise(2, 2)];
    expect(nextIncompleteExerciseIndex(exercises, 1)).toBe(1);
    expect(nextIncompleteExerciseIndex(exercises, 1, 1)).toBe(exercises.length);
  });

  it('returns the exercise-count sentinel when everything is complete', () => {
    const exercises = [exercise(2, 2), exercise(1, 1)];
    expect(nextIncompleteExerciseIndex(exercises, 0)).toBe(exercises.length);
  });

  it('starts at the first exercise for an invalid or end-sentinel origin', () => {
    const exercises = [exercise(2, 0), exercise(2, 0)];
    expect(nextIncompleteExerciseIndex(exercises, -10)).toBe(0);
    expect(nextIncompleteExerciseIndex(exercises, exercises.length)).toBe(0);
    expect(nextIncompleteExerciseIndex(exercises, 99, 99)).toBe(0);
  });
});

describe('sessionWillBeCompleteAfterSet', () => {
  it('recognizes the final outstanding set', () => {
    const exercises = [exercise(2, 2), exercise(3, 2)];
    expect(sessionWillBeCompleteAfterSet(exercises, 1)).toBe(true);
  });

  it('stays false when another exercise was skipped', () => {
    const exercises = [exercise(2, 1), exercise(3, 2)];
    expect(sessionWillBeCompleteAfterSet(exercises, 1)).toBe(false);
  });

  it('rejects empty sessions and invalid indexes', () => {
    expect(sessionWillBeCompleteAfterSet([], 0)).toBe(false);
    expect(sessionWillBeCompleteAfterSet([exercise(1, 0)], -1)).toBe(false);
    expect(sessionWillBeCompleteAfterSet([exercise(1, 0)], 1)).toBe(false);
    expect(sessionWillBeCompleteAfterSet([exercise(1, 0)], 0.5)).toBe(false);
  });
});
