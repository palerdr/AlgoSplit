export interface ProgressExercise {
  exercise_name: string;
  reps: number[];
  weight: number[];
  rir?: Array<number | null> | null;
}

export interface ProgressWorkout {
  completed_at: string;
  session_name: string;
  exercises: ProgressExercise[];
}

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

export function computeCapacityScore(
  weight: number,
  reps: number,
  rir: number | null
): number {
  return weight * (1 + (reps + (rir ?? 0)) / 30);
}

/** Pick one strongest capacity set from each workout containing the exercise. */
export function extractSessionPoints(
  workouts: readonly ProgressWorkout[],
  exerciseName: string
): SessionDataPoint[] {
  const points: SessionDataPoint[] = [];
  const target = exerciseName.toLocaleLowerCase();

  for (const workout of workouts) {
    const matching = workout.exercises.filter(
      (exercise) => exercise.exercise_name.toLocaleLowerCase() === target
    );
    let bestScore = -Infinity;
    let bestWeight = 0;
    let bestReps = 0;
    let bestRir: number | null = null;
    let bestSetNumber = 0;
    let setOffset = 0;

    for (const exercise of matching) {
      for (let index = 0; index < exercise.reps.length; index++) {
        const weight = exercise.weight[index] ?? 0;
        const reps = exercise.reps[index] ?? 0;
        const rir = exercise.rir?.[index] ?? null;
        if (weight === 0) continue;
        const score = computeCapacityScore(weight, reps, rir);
        if (score > bestScore) {
          bestScore = score;
          bestWeight = weight;
          bestReps = reps;
          bestRir = rir;
          bestSetNumber = setOffset + index + 1;
        }
      }
      setOffset += exercise.reps.length;
    }

    const date = new Date(workout.completed_at);
    if (bestScore > 0 && Number.isFinite(bestScore) && Number.isFinite(date.getTime())) {
      points.push({
        date,
        sessionName: workout.session_name,
        weight: bestWeight,
        reps: bestReps,
        rir: bestRir,
        capacityScore: bestScore,
        setNumber: bestSetNumber,
      });
    }
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function normalizeScores(points: readonly SessionDataPoint[]): number[] {
  if (points.length === 0) return [];
  const scores = points.map((point) => point.capacityScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0.5);
  return scores.map((score) => (score - min) / (max - min));
}

export function progressColor(normalized: number): string {
  const value = Math.max(0, Math.min(1, normalized));
  if (value < 1 / 3) return '#0A5E27';
  if (value < 2 / 3) return '#23A24A';
  return '#41C46E';
}

export function splineSegments(points: readonly ChartPoint[]): SplineSegment[] {
  if (points.length < 2) return [];
  const segments: SplineSegment[] = [];
  const tension = 1 / 6;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    segments.push({
      start: p1,
      cp1: {
        x: p1.x + (p2.x - p0.x) * tension,
        y: Math.max(minY, Math.min(maxY, p1.y + (p2.y - p0.y) * tension)),
      },
      cp2: {
        x: p2.x - (p3.x - p1.x) * tension,
        y: Math.max(minY, Math.min(maxY, p2.y - (p3.y - p1.y) * tension)),
      },
      end: p2,
    });
  }
  return segments;
}

export function getExerciseNamesFromWorkouts(
  workouts: readonly ProgressWorkout[]
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const key = exercise.exercise_name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(exercise.exercise_name);
    }
  }
  return names;
}

export function computeTrend(
  points: readonly SessionDataPoint[]
): 'up' | 'down' | 'flat' {
  if (points.length < 2) return 'flat';
  if (points.length < 4) {
    const first = points[0].capacityScore;
    const change = first === 0 ? 0 : (points[points.length - 1].capacityScore - first) / first;
    return change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat';
  }
  const count = Math.min(3, Math.floor(points.length / 2));
  const average = (values: readonly SessionDataPoint[]) =>
    values.reduce((sum, point) => sum + point.capacityScore, 0) / values.length;
  const recent = average(points.slice(-count));
  const previous = average(points.slice(-2 * count, -count));
  const change = previous === 0 ? 0 : (recent - previous) / previous;
  return change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat';
}
