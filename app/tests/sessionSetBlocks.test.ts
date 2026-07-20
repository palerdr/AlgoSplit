import type { Exercise } from '../src/data/exercises';
import type { SessionExercise } from '../src/state/AppState';
import {
  aggregateCompletedSessionExercises,
  createSessionSetBlocks,
} from '../src/state/sessionSetBlocks';

const exercise: Exercise = {
  id: 'pushdown',
  name: 'Pushdown',
  muscles: [],
  axialLoad: 0,
  resistanceProfile: 'mid',
  unilateral: false,
};

describe('session set blocks', () => {
  it('expands one requested exercise into stable independently reorderable sets', () => {
    const blocks = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 7,
      exercise,
      requestedSets: 3,
      warmupEnabled: true,
      notes: 'Elbows still',
    });

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.sessionExerciseId)).toEqual([
      'session-1234-exercise-7',
      'session-1234-exercise-8',
      'session-1234-exercise-9',
    ]);
    expect(new Set(blocks.map((block) => block.sessionExerciseId)).size).toBe(3);
    expect(new Set(blocks.map((block) => block.sourceOccurrenceId))).toEqual(
      new Set(['session-1234-occurrence-7'])
    );
    expect(blocks.map((block) => block.setOrdinal)).toEqual([1, 2, 3]);
    expect(blocks.map((block) => block.setCount)).toEqual([3, 3, 3]);
    expect(blocks.map((block) => block.targetSets)).toEqual([1, 1, 1]);
    expect(blocks.map((block) => block.warmupEnabled)).toEqual([true, false, false]);
  });

  it('aggregates sibling sets but preserves separate duplicate occurrences', () => {
    const firstOccurrence = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 0,
      exercise,
      requestedSets: 3,
    }).map((block, index) => ({
      ...block,
      completedSets: [{ weight: 50 + index * 5, reps: 10 }],
    }));
    const secondOccurrence = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 3,
      exercise,
      requestedSets: 1,
    }).map((block) => ({
      ...block,
      completedSets: [{ weight: 70, reps: 8 }],
    }));

    // A live reorder does not lose the source-set order inside completed data.
    const reordered = [
      firstOccurrence[2],
      secondOccurrence[0],
      firstOccurrence[0],
      firstOccurrence[1],
    ];
    expect(aggregateCompletedSessionExercises(reordered)).toEqual([
      {
        name: 'Pushdown',
        sets: 3,
        records: [
          { weight: 50, reps: 10 },
          { weight: 55, reps: 10 },
          { weight: 60, reps: 10 },
        ],
        notes: '',
      },
      {
        name: 'Pushdown',
        sets: 1,
        records: [{ weight: 70, reps: 8 }],
        notes: '',
      },
    ]);
  });

  it('never attributes a changed block to a sibling with another exercise id', () => {
    const blocks = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 0,
      exercise,
      requestedSets: 2,
    });
    const changedExercise: Exercise = { ...exercise, id: 'curl', name: 'Curl' };
    const completed: SessionExercise[] = [
      { ...blocks[0], completedSets: [{ weight: 50, reps: 10 }] },
      {
        ...blocks[1],
        exercise: changedExercise,
        completedSets: [{ weight: 25, reps: 12 }],
      },
    ];

    expect(aggregateCompletedSessionExercises(completed)).toEqual([
      {
        name: 'Pushdown',
        sets: 1,
        records: [{ weight: 50, reps: 10 }],
        notes: '',
      },
      {
        name: 'Curl',
        sets: 1,
        records: [{ weight: 25, reps: 12 }],
        notes: '',
      },
    ]);
  });

  it('keeps completed records in accepted chronology after a live reorder', () => {
    const blocks = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 0,
      exercise,
      requestedSets: 3,
    });
    const completed: SessionExercise[] = [
      {
        ...blocks[2],
        completedSets: [{ weight: 60, reps: 8 }],
        lastCompletedAt: 3000,
      },
      {
        ...blocks[0],
        completedSets: [{ weight: 50, reps: 12 }],
        lastCompletedAt: 1000,
      },
      {
        ...blocks[1],
        completedSets: [{ weight: 55, reps: 10 }],
        lastCompletedAt: 2000,
      },
    ];

    expect(aggregateCompletedSessionExercises(completed)[0].records).toEqual([
      { weight: 50, reps: 12 },
      { weight: 55, reps: 10 },
      { weight: 60, reps: 8 },
    ]);
  });

  it('places the latest separately-authored duplicate last for history provenance', () => {
    const earlier = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 0,
      exercise,
      requestedSets: 1,
    })[0];
    const latest = createSessionSetBlocks({
      startedAt: 1234,
      firstOrdinal: 1,
      exercise,
      requestedSets: 1,
    })[0];

    const aggregated = aggregateCompletedSessionExercises([
      {
        ...latest,
        completedSets: [{ weight: 80, reps: 8 }],
        lastCompletedAt: 3000,
      },
      {
        ...earlier,
        completedSets: [{ weight: 60, reps: 12 }],
        lastCompletedAt: 1000,
      },
    ]);

    expect(aggregated.map((row) => row.records[0].weight)).toEqual([60, 80]);
  });
});
