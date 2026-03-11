import {
  computeCapacityScore,
  extractSessionPoints,
  normalizeScores,
  progressColor,
  splineSegments,
  computeTrend,
  getExerciseNamesFromWorkouts,
} from '../src/components/progress/progressTransforms';
import type { WorkoutLogResponse } from '../src/types/api.types';

// --------------- computeCapacityScore ---------------

describe('computeCapacityScore', () => {
  it('returns weight when reps=0 and rir=null', () => {
    // score = 100 * (1 + (0+0)/30) = 100
    expect(computeCapacityScore(100, 0, null)).toBe(100);
  });

  it('computes correctly with reps only (rir null)', () => {
    // score = 100 * (1 + (10+0)/30) = 100 * 1.333... ≈ 133.33
    expect(computeCapacityScore(100, 10, null)).toBeCloseTo(133.33, 1);
  });

  it('includes rir in calculation', () => {
    // score = 100 * (1 + (10+2)/30) = 100 * 1.4 = 140
    expect(computeCapacityScore(100, 10, 2)).toBe(140);
  });

  it('treats null rir as 0', () => {
    expect(computeCapacityScore(100, 10, null)).toBe(computeCapacityScore(100, 10, 0));
  });

  it('handles zero weight', () => {
    expect(computeCapacityScore(0, 10, 2)).toBe(0);
  });
});

// --------------- extractSessionPoints ---------------

function makeWorkout(
  completed_at: string,
  exercises: Array<{
    name: string;
    reps: number[];
    weight: number[];
    rir?: number[] | null;
  }>,
): WorkoutLogResponse {
  return {
    id: 'w1',
    user_id: 'u1',
    session_id: null,
    split_id: null,
    session_name: 'Test',
    completed_at,
    duration_minutes: null,
    notes: null,
    created_at: completed_at,
    exercises: exercises.map((e, i) => ({
      id: `e${i}`,
      workout_log_id: 'w1',
      exercise_name: e.name,
      sets_completed: e.reps.length,
      reps: e.reps,
      weight: e.weight,
      rir: e.rir ?? null,
      order_index: i,
      notes: null,
      created_at: completed_at,
    })),
  };
}

describe('extractSessionPoints', () => {
  it('picks the set with highest capacity score per workout', () => {
    const workouts = [
      makeWorkout('2025-01-01T12:00:00Z', [
        { name: 'Bench Press', reps: [8, 10, 6], weight: [135, 135, 155] },
      ]),
    ];

    const points = extractSessionPoints(workouts, 'Bench Press');
    expect(points).toHaveLength(1);
    // Set 2 (155lb x 6): 155 * (1 + 6/30) = 155 * 1.2 = 186
    // Set 1 (135lb x 10): 135 * (1 + 10/30) = 135 * 1.333 = 180
    // Set 0 (135lb x 8): 135 * (1 + 8/30) = 135 * 1.267 = 171
    // Best = set 2 (186)
    expect(points[0].weight).toBe(155);
    expect(points[0].reps).toBe(6);
    expect(points[0].capacityScore).toBeCloseTo(186, 0);
    expect(points[0].setNumber).toBe(3);
    expect(points[0].sessionName).toBe('Test');
  });

  it('picks the best set across multiple exercise rows in the same workout', () => {
    const workouts = [
      makeWorkout('2025-01-01T12:00:00Z', [
        { name: 'Bench Press', reps: [8, 8], weight: [135, 145] },
        { name: 'Bench Press', reps: [6], weight: [165], rir: [1] },
      ]),
    ];

    const points = extractSessionPoints(workouts, 'Bench Press');
    expect(points).toHaveLength(1);
    expect(points[0].weight).toBe(165);
    expect(points[0].reps).toBe(6);
    expect(points[0].rir).toBe(1);
    expect(points[0].setNumber).toBe(3);
    expect(points[0].capacityScore).toBeCloseTo(203.5, 1);
  });

  it('skips zero-weight sets', () => {
    const workouts = [
      makeWorkout('2025-01-01T12:00:00Z', [
        { name: 'Pull Up', reps: [10, 8], weight: [0, 0] },
      ]),
    ];
    const points = extractSessionPoints(workouts, 'Pull Up');
    expect(points).toHaveLength(0);
  });

  it('is case-insensitive on exercise name', () => {
    const workouts = [
      makeWorkout('2025-01-01T12:00:00Z', [
        { name: 'bench press', reps: [10], weight: [135] },
      ]),
    ];
    const points = extractSessionPoints(workouts, 'Bench Press');
    expect(points).toHaveLength(1);
  });

  it('sorts by date ascending', () => {
    const workouts = [
      makeWorkout('2025-01-15T12:00:00Z', [
        { name: 'Squat', reps: [5], weight: [225] },
      ]),
      makeWorkout('2025-01-01T12:00:00Z', [
        { name: 'Squat', reps: [5], weight: [205] },
      ]),
    ];
    const points = extractSessionPoints(workouts, 'Squat');
    expect(points).toHaveLength(2);
    expect(points[0].weight).toBe(205);
    expect(points[1].weight).toBe(225);
  });
});

// --------------- normalizeScores ---------------

describe('normalizeScores', () => {
  it('returns empty for empty input', () => {
    expect(normalizeScores([])).toEqual([]);
  });

  it('returns 0.5 for all-equal scores', () => {
    const points = [
      { date: new Date(), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 133, setNumber: 1 },
      { date: new Date(), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 133, setNumber: 1 },
    ];
    const norms = normalizeScores(points);
    expect(norms).toEqual([0.5, 0.5]);
  });

  it('normalizes to [0, 1] range', () => {
    const points = [
      { date: new Date(), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 100, setNumber: 1 },
      { date: new Date(), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 150, setNumber: 1 },
      { date: new Date(), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 200, setNumber: 1 },
    ];
    const norms = normalizeScores(points);
    expect(norms[0]).toBe(0);
    expect(norms[1]).toBe(0.5);
    expect(norms[2]).toBe(1);
  });
});

// --------------- progressColor ---------------

describe('progressColor', () => {
  it('returns dark green at 0', () => {
    expect(progressColor(0)).toBe('rgb(42, 90, 58)');
  });

  it('returns bright green at 1', () => {
    expect(progressColor(1)).toBe('rgb(74, 222, 128)');
  });

  it('clamps values outside [0,1]', () => {
    expect(progressColor(-0.5)).toBe(progressColor(0));
    expect(progressColor(1.5)).toBe(progressColor(1));
  });
});

// --------------- splineSegments ---------------

describe('splineSegments', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(splineSegments([])).toEqual([]);
    expect(splineSegments([{ x: 0, y: 0 }])).toEqual([]);
  });

  it('returns N-1 segments for N points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 3 },
      { x: 30, y: 8 },
    ];
    const segs = splineSegments(pts);
    expect(segs).toHaveLength(3);
    // Each segment connects consecutive points
    expect(segs[0].start).toEqual(pts[0]);
    expect(segs[0].end).toEqual(pts[1]);
    expect(segs[2].start).toEqual(pts[2]);
    expect(segs[2].end).toEqual(pts[3]);
  });
});

// --------------- computeTrend ---------------

describe('computeTrend', () => {
  it('returns flat for fewer than 2 points', () => {
    expect(computeTrend([])).toBe('flat');
    expect(
      computeTrend([
        {
          date: new Date(),
          sessionName: 'Test',
          weight: 100,
          reps: 10,
          rir: null,
          capacityScore: 133,
          setNumber: 1,
        },
      ]),
    ).toBe('flat');
  });

  it('returns up when recent capacity is > 2% higher', () => {
    const points = [
      { date: new Date('2025-01-01'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 100, setNumber: 1 },
      { date: new Date('2025-01-08'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 110, setNumber: 1 },
    ];
    expect(computeTrend(points)).toBe('up');
  });

  it('returns down when recent capacity is > 2% lower', () => {
    const points = [
      { date: new Date('2025-01-01'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 110, setNumber: 1 },
      { date: new Date('2025-01-08'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 100, setNumber: 1 },
    ];
    expect(computeTrend(points)).toBe('down');
  });

  it('returns flat when change is within 2%', () => {
    const points = [
      { date: new Date('2025-01-01'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 100, setNumber: 1 },
      { date: new Date('2025-01-08'), sessionName: 'Test', weight: 100, reps: 10, rir: null, capacityScore: 101, setNumber: 1 },
    ];
    expect(computeTrend(points)).toBe('flat');
  });
});

// --------------- getExerciseNamesFromWorkouts ---------------

describe('getExerciseNamesFromWorkouts', () => {
  it('returns unique names in recency order', () => {
    const workouts = [
      makeWorkout('2025-01-15', [
        { name: 'Bench Press', reps: [10], weight: [135] },
        { name: 'Squat', reps: [5], weight: [225] },
      ]),
      makeWorkout('2025-01-01', [
        { name: 'Squat', reps: [5], weight: [205] },
        { name: 'Deadlift', reps: [3], weight: [315] },
      ]),
    ];
    const names = getExerciseNamesFromWorkouts(workouts);
    expect(names).toEqual(['Bench Press', 'Squat', 'Deadlift']);
  });
});
