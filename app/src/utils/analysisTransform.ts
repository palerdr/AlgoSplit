import type { MuscleStats, AnalysisResponse, WorkoutLogResponse } from '../types/api.types';
import { getStimulusLevel, stimulusAdequacy, muscleFatigue } from '../analysis/stimulusScale';

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
 *   territory. This is the direct numeric summary of the body map: a bright
 *   muscle on the map always contributes to the dial.
 *
 * - `headroom`: remaining whole-body weekly recovery capacity, averaged over
 *   all `total_muscles` regions in the model. Untrained muscles contribute
 *   zero fatigue (correctly — they have full local headroom), so a one-muscle
 *   workout reads ~97% headroom (28 of 29 regions are fully rested) rather
 *   than 0%. Low overall headroom means many regions are near their weekly
 *   ceiling; high means there is room to add volume.
 */
export function computeDashboardDials(analysis: AnalysisResponse): {
  stimulus: number;
  headroom: number;
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

  // Headroom: 1 − mean fatigue across the whole modelled body. Denominator is
  // `total_muscles` (the model's region count, normally 29), not the trained
  // count — untrained regions legitimately contribute zero fatigue, so they
  // belong in the denominator. Falling back to muscles.length keeps the dial
  // sane if `summary.total_muscles` is missing.
  const denominator =
    analysis.summary?.total_muscles && analysis.summary.total_muscles > 0
      ? analysis.summary.total_muscles
      : analysis.muscles.length;
  const fatigueSum = analysis.muscles.reduce(
    (sum, muscle) => sum + muscleFatigue(muscle.net_stimulus),
    0,
  );
  const headroom = denominator > 0
    ? Math.round(Math.min(100, Math.max(0, 1 - fatigueSum / denominator) * 100))
    : 100;

  return { stimulus, headroom };
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
