import { groupSplitExercises } from '../src/workout/splitExerciseGroups';

interface Row {
  catalogId?: string;
  name: string;
}

interface Session {
  name: string;
  exercises: Row[];
}

const group = (sessions: Session[]) =>
  groupSplitExercises(sessions, {
    exercises: (session) => session.exercises,
    name: (exercise) => exercise.name,
    identity: (exercise) => exercise.catalogId,
  });

describe('split-wide exercise identity', () => {
  it('unifies one catalog movement across every session occurrence', () => {
    const sessions: Session[] = [
      {
        name: 'Full Body A',
        exercises: [
          { catalogId: 'barbell_bench_press', name: 'Barbell Bench Press' },
          { catalogId: 'barbell_row', name: 'Barbell Row' },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { catalogId: 'barbell_bench_press', name: 'BARBELL BENCH PRESS' },
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          { catalogId: 'barbell_bench_press', name: 'Bench Press' },
        ],
      },
    ];

    const bench = group(sessions).find(
      (movement) => movement.identity === 'barbell_bench_press'
    );

    expect(bench?.name).toBe('Barbell Bench Press');
    expect(bench?.occurrences.map((occurrence) => occurrence.session.name)).toEqual([
      'Full Body A',
      'Full Body B',
      'Full Body C',
    ]);
    expect(bench?.occurrences.map((occurrence) => occurrence.targetKey)).toEqual([
      '0:0',
      '1:0',
      '2:0',
    ]);
  });

  it('keeps different catalog movements separate even when names collide', () => {
    const movements = group([
      {
        name: 'A',
        exercises: [
          { catalogId: 'bench-a', name: 'Bench Press' },
          { catalogId: 'bench-b', name: 'Bench Press' },
        ],
      },
    ]);

    expect(movements.map((movement) => movement.identity)).toEqual([
      'bench-a',
      'bench-b',
    ]);
  });

  it('falls back to a normalized name for legacy rows without catalog ids', () => {
    const movements = group([
      { name: 'A', exercises: [{ name: ' Barbell Bench Press ' }] },
      { name: 'B', exercises: [{ name: 'barbell bench press' }] },
    ]);

    expect(movements).toHaveLength(1);
    expect(movements[0].occurrences).toHaveLength(2);
  });
});
