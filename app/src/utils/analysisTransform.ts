import type { MuscleStats, AnalysisResponse, WorkoutLogResponse } from '../types/api.types';
import { getStimulusLevel, stimulusAdequacy } from '../analysis/stimulusScale';

/**
 * Convert muscle stats array to stimulus levels keyed by region_id.
 * Region IDs match the 3D body model 1:1.
 */
export function musclesToStimulusLevels(
  muscles: MuscleStats[],
): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const m of muscles) {
    levels[m.region_id] = getStimulusLevel(m.net_stimulus);
  }
  return levels;
}

/**
 * Compute 0-100 dial values from analysis data.
 *
 * - `stimulus`: mean dose adequacy across every muscle you trained (any
 *   stimulus > 0, regardless of tier). Saturates at OPTIMAL_NET per muscle, so
 *   "100" means every trained muscle is at or above productive-growth
 *   territory. Direct numeric summary of the body map.
 *
 * - `recovery`: time-based readiness for the next stimulus application, RIGHT
 *   NOW. Stimulus-WEIGHTED mean of per-muscle readiness across the muscles
 *   you've actually trained in this window. A muscle counts in proportion to
 *   how hard it was hit (its weekly raw `stimulus`), so:
 *
 *     - A fried muscle from a hard session pulls Recovery down meaningfully
 *       (it has high weight and low readiness), and the dial agrees with the
 *       bright body-map region rather than averaging it away across 28 idle
 *       untrained muscles.
 *     - Untrained regions get zero weight and don't artificially inflate the
 *       dial — "I haven't trained legs all year" doesn't make you look
 *       recovered.
 *     - A balanced moderate week reads in the middle.
 *
 *   Returns `null` when no trained muscle reports a readiness value (older
 *   cached payloads, schema drift). The dashboard renders that as "—" rather
 *   than silently inventing the optimistic answer.
 */
export function computeDashboardDials(analysis: AnalysisResponse): {
  stimulus: number;
  recovery: number | null;
} {
  const trainedMuscles = analysis.muscles.filter((muscle) => muscle.stimulus > 0);

  // Stimulus: arithmetic mean adequacy over trained muscles. No tier filter,
  // no focus weighting — net_stimulus already encodes tier contribution, so
  // weighting on top would be double-counting and would silently exclude
  // muscles that show as bright on the body map.
  const adequacySum = trainedMuscles.reduce(
    (sum, muscle) => sum + stimulusAdequacy(muscle.net_stimulus),
    0,
  );
  const stimulus = trainedMuscles.length
    ? Math.round((adequacySum / trainedMuscles.length) * 100)
    : 0;

  // Recovery: stimulus-weighted mean of readiness over trained muscles.
  if (trainedMuscles.length === 0) {
    // Nothing trained in the window → fully ready by definition.
    return { stimulus, recovery: 100 };
  }
  let weightedReadiness = 0;
  let weightSum = 0;
  for (const muscle of trainedMuscles) {
    const r = muscle.recovery_readiness;
    if (r === null || r === undefined || !Number.isFinite(r)) continue;
    const weight = muscle.stimulus;
    if (weight <= 0) continue;
    weightedReadiness += Math.max(0, Math.min(1, r)) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) {
    // Trained muscles exist but none reports readiness (older payload, schema
    // drift). Honest: data unavailable.
    return { stimulus, recovery: null };
  }
  const recovery = Math.round(
    Math.min(100, Math.max(0, weightedReadiness / weightSum) * 100),
  );

  return { stimulus, recovery };
}

/**
 * Compute a 0-100 progress score from recent workout history.
 *
 * Compares overlapping exercises between the two most recent workouts to
 * measure how many exercises improved and by how much. Uses estimated 1RM
 * as the comparison metric to combine weight and reps into one number.
 *
 * Outliers are clamped so a single exercise swap or massive jump/drop
 * doesn't dominate the score.
 */
export function computeProgressDial(workouts: WorkoutLogResponse[]): number {
  if (workouts.length < 2) return 0;

  // Sort descending by completed_at so [0] is most recent
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
  );

  const recent = sorted[0];
  const previous = sorted[1];

  // Build exercise -> best estimated 1RM maps
  const recentBest = bestE1rmByExercise(recent);
  const previousBest = bestE1rmByExercise(previous);

  // Find overlapping exercises
  const commonExercises = Object.keys(recentBest).filter((name) => name in previousBest);
  if (commonExercises.length === 0) return 0;

  // Compute per-exercise progress ratios, clamped to avoid outliers
  const MAX_RATIO = 1.15; // cap at +15% per exercise
  const MIN_RATIO = 0.85; // cap at -15% per exercise
  let totalRatio = 0;
  let improved = 0;

  for (const name of commonExercises) {
    const prev = previousBest[name];
    if (prev <= 0) continue;
    const raw = recentBest[name] / prev;
    const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, raw));
    totalRatio += clamped;
    if (clamped > 1.005) improved++;
  }

  if (commonExercises.length === 0) return 0;

  const avgRatio = totalRatio / commonExercises.length;
  const improvedShare = improved / commonExercises.length;

  // Map to 0-100 where 1.0 ratio = 50 (maintained), >1 = progress, <1 = regression
  // avgRatio contribution: 1.0 -> 50, 1.15 -> 100, 0.85 -> 0
  const ratioScore = Math.min(100, Math.max(0, ((avgRatio - 0.85) / 0.30) * 100));
  // Improved share bonus: what fraction of exercises improved
  const improvedScore = improvedShare * 100;

  return Math.round(ratioScore * 0.7 + improvedScore * 0.3);
}

function bestE1rmByExercise(workout: WorkoutLogResponse): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ex of workout.exercises) {
    let best = 0;
    for (let i = 0; i < ex.reps.length; i++) {
      const reps = ex.reps[i];
      const weight = ex.weight[i];
      if (reps > 0 && weight > 0) {
        // Brzycki estimated 1RM
        const e1rm = reps === 1 ? weight : weight * (36 / (37 - reps));
        if (e1rm > best) best = e1rm;
      }
    }
    if (best > 0) {
      result[ex.exercise_name.toLowerCase()] = best;
    }
  }
  return result;
}

/**
 * Generate insight cards from analysis data.
 */
export function generateInsights(
  analysis: AnalysisResponse,
): { title: string; description: string }[] {
  const insights: { title: string; description: string }[] = [];
  const { summary, suggestions, muscles } = analysis;

  // Muscle balance insight
  if (muscles.length > 0) {
    const sorted = [...muscles].sort((a, b) => b.net_stimulus - a.net_stimulus);
    const top = sorted.slice(0, 3).map((m) => m.display_name);
    const bottom = sorted
      .filter((m) => m.net_stimulus < 1)
      .slice(0, 3)
      .map((m) => m.display_name);

    if (bottom.length > 0) {
      insights.push({
        title: 'Muscle Balance',
        description: `Strongest stimulus: ${top.join(', ')}. Consider adding volume for ${bottom.join(', ')}.`,
      });
    } else {
      insights.push({
        title: 'Muscle Balance',
        description: `Great coverage! Top stimulus: ${top.join(', ')}. ${summary.muscles_trained}/${summary.total_muscles} muscles trained.`,
      });
    }
  }

  // Volume insight
  insights.push({
    title: 'Weekly Volume',
    description: `${summary.total_sets} total sets across ${summary.muscles_trained} muscles. Average ${summary.avg_net_stimulus.toFixed(1)} net stimulus per muscle.`,
  });

  // Top suggestion
  if (suggestions.length > 0) {
    const top = suggestions[0];
    insights.push({
      title: 'Top Suggestion',
      description: `${top.muscle}: ${top.suggestion}`,
    });
  }

  return insights;
}
