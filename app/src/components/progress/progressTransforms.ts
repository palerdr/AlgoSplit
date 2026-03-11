import type { WorkoutLogResponse } from '../../types/api.types';

// --------------- Types ---------------

export interface SessionDataPoint {
  date: Date;
  sessionName: string;
  weight: number;
  reps: number;
  rir: number | null;
  capacityScore: number;
  setNumber: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface SplineSegment {
  start: ChartPoint;
  cp1: ChartPoint;
  cp2: ChartPoint;
  end: ChartPoint;
}

// --------------- Core math ---------------

/** capacityScore = weight × (1 + (reps + assumedRir) / 30) */
export function computeCapacityScore(
  weight: number,
  reps: number,
  rir: number | null,
): number {
  const assumedRir = rir ?? 0;
  return weight * (1 + (reps + assumedRir) / 30);
}

// --------------- Data extraction ---------------

/**
 * From a list of workouts, extract one representative SessionDataPoint
 * per workout that includes the given exercise.
 * Representative = the set with the highest capacityScore.
 * Skips zero-weight sets.
 */
export function extractSessionPoints(
  workouts: WorkoutLogResponse[],
  exerciseName: string,
): SessionDataPoint[] {
  const points: SessionDataPoint[] = [];

  for (const workout of workouts) {
    const matchingExercises = workout.exercises.filter(
      (e) => e.exercise_name.toLowerCase() === exerciseName.toLowerCase(),
    );
    if (matchingExercises.length === 0) continue;

    let bestScore = -Infinity;
    let bestWeight = 0;
    let bestReps = 0;
    let bestRir: number | null = null;
    let bestSetNumber = 0;

    let setOffset = 0;
    for (const exercise of matchingExercises) {
      for (let i = 0; i < exercise.reps.length; i++) {
        const w = exercise.weight[i] ?? 0;
        const r = exercise.reps[i] ?? 0;
        const ir = exercise.rir?.[i] ?? null;
        if (w === 0) continue;

        const score = computeCapacityScore(w, r, ir);
        if (score > bestScore) {
          bestScore = score;
          bestWeight = w;
          bestReps = r;
          bestRir = ir;
          bestSetNumber = setOffset + i + 1;
        }
      }

      setOffset += exercise.reps.length;
    }

    if (bestScore > 0 && isFinite(bestScore)) {
      points.push({
        date: new Date(workout.completed_at),
        sessionName: workout.session_name,
        weight: bestWeight,
        reps: bestReps,
        rir: bestRir,
        capacityScore: bestScore,
        setNumber: bestSetNumber,
      });
    }
  }

  points.sort((a, b) => a.date.getTime() - b.date.getTime());
  return points;
}

// --------------- Color normalization ---------------

/**
 * Normalize capacity scores to [0, 1] across visible window.
 * All-equal scores → 0.5 (neutral mid-accent).
 */
export function normalizeScores(points: SessionDataPoint[]): number[] {
  if (points.length === 0) return [];
  const scores = points.map((p) => p.capacityScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0.5);
  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Map normalized [0,1] → rgb color.
 * 0 = muted green (#2A5A3A) → 1 = bright green (#4ADE80).
 */
export function progressColor(normalized: number): string {
  const t = Math.max(0, Math.min(1, normalized));
  const r = Math.round(42 + t * (74 - 42));
  const g = Math.round(90 + t * (222 - 90));
  const b = Math.round(58 + t * (128 - 58));
  return `rgb(${r}, ${g}, ${b})`;
}

// --------------- Spline (Catmull-Rom → cubic Bézier) ---------------

/**
 * Convert ordered chart points into cubic Bézier segments
 * using Catmull-Rom interpolation (tension = 1/6).
 */
export function splineSegments(points: ChartPoint[]): SplineSegment[] {
  if (points.length < 2) return [];
  const segments: SplineSegment[] = [];
  const t = 1 / 6;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    segments.push({
      start: p1,
      cp1: {
        x: p1.x + (p2.x - p0.x) * t,
        y: Math.max(minY, Math.min(maxY, p1.y + (p2.y - p0.y) * t)),
      },
      cp2: {
        x: p2.x - (p3.x - p1.x) * t,
        y: Math.max(minY, Math.min(maxY, p2.y - (p3.y - p1.y) * t)),
      },
      end: p2,
    });
  }

  return segments;
}

// --------------- Exercise list helpers ---------------

/** Unique exercise names from workouts, ordered by recency (most recent first). */
export function getExerciseNamesFromWorkouts(
  workouts: WorkoutLogResponse[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!seen.has(ex.exercise_name)) {
        seen.add(ex.exercise_name);
        result.push(ex.exercise_name);
      }
    }
  }
  return result;
}

// --------------- Trend ---------------

/**
 * Compare average capacityScore of last N points vs first N points.
 * N = min(3, floor(length / 2)).
 * > 2% improvement = 'up', > 2% decline = 'down', else 'flat'.
 */
export function computeTrend(
  points: SessionDataPoint[],
): 'up' | 'down' | 'flat' {
  if (points.length < 2) return 'flat';
  if (points.length < 4) {
    const first = points[0].capacityScore;
    const last = points[points.length - 1].capacityScore;
    if (first === 0) return 'flat';
    const pctChange = (last - first) / first;
    if (pctChange > 0.02) return 'up';
    if (pctChange < -0.02) return 'down';
    return 'flat';
  }

  const n = Math.min(3, Math.floor(points.length / 2));
  const recentWindow = points.slice(-n);
  const previousWindow = points.slice(-2 * n, -n);
  const recentAvg =
    recentWindow.reduce((s, p) => s + p.capacityScore, 0) / recentWindow.length;
  const previousAvg =
    previousWindow.reduce((s, p) => s + p.capacityScore, 0) / previousWindow.length;
  if (previousAvg === 0) return 'flat';
  const pctChange = (recentAvg - previousAvg) / previousAvg;
  if (pctChange > 0.02) return 'up';
  if (pctChange < -0.02) return 'down';
  return 'flat';
}
