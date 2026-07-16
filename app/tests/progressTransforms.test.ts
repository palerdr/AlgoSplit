import {
  ProgressWorkout,
  computeCapacityScore,
  computeTrend,
  extractSessionPoints,
  normalizeScores,
  progressColor,
} from '../src/components/details/progressTransforms';
import { visibleMuscleRows } from '../src/components/details/splitView';

const workouts: ProgressWorkout[] = [
  {
    completed_at: '2026-02-02T12:00:00.000Z',
    session_name: 'Later',
    exercises: [
      { exercise_name: 'Bench', reps: [8], weight: [105], rir: [0] },
      { exercise_name: 'Bench', reps: [5], weight: [110], rir: [3] },
    ],
  },
  {
    completed_at: '2026-01-01T12:00:00.000Z',
    session_name: 'Earlier',
    exercises: [{ exercise_name: 'bench', reps: [10, 5], weight: [100, 0], rir: null }],
  },
];

describe('deployed progress model', () => {
  it('includes RIR in capacity and selects the strongest set across duplicate rows', () => {
    expect(computeCapacityScore(100, 10, null)).toBeCloseTo(133.3333);
    const points = extractSessionPoints(workouts, 'BENCH');
    expect(points.map((point) => point.sessionName)).toEqual(['Earlier', 'Later']);
    expect(points[1]).toMatchObject({ weight: 110, reps: 5, rir: 3, setNumber: 2 });
  });

  it('skips zero-weight sets and normalizes equal scores safely', () => {
    const bodyweight = extractSessionPoints(
      [
        {
          completed_at: '2026-01-01T00:00:00Z',
          session_name: 'Bodyweight',
          exercises: [{ exercise_name: 'Pull-up', reps: [8], weight: [0] }],
        },
      ],
      'Pull-up'
    );
    expect(bodyweight).toEqual([]);
    const one = extractSessionPoints(workouts.slice(0, 1), 'Bench');
    expect(normalizeScores(one)).toEqual([0.5]);
    expect(computeTrend(one)).toBe('flat');
  });

  it('uses the exact Overview green palette for the spline gradient', () => {
    expect(progressColor(0)).toBe('#0A5E27');
    expect(progressColor(0.5)).toBe('#23A24A');
    expect(progressColor(1)).toBe('#41C46E');
  });
});

describe('compact muscle rows', () => {
  it('caps the default at 12 and expands to every backend region', () => {
    const rows = Array.from({ length: 29 }, (_, index) => index);
    expect(visibleMuscleRows(rows, false)).toHaveLength(12);
    expect(visibleMuscleRows(rows, true)).toHaveLength(29);
  });
});
