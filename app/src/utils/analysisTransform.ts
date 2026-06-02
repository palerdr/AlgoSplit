import type { MuscleStats, AnalysisResponse, WorkoutLogResponse } from '../types/api.types';
import {
  getStimulusLevel,
  stimulusAdequacy,
  muscleFatigue,
  FOCUS_PRIME_BONUS,
} from '../analysis/stimulusScale';

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
 * Both dials are anchored to the engine's real net_stimulus scale (see
 * src/analysis/stimulusScale.ts) and read directly off the muscles you
 * trained, so they line up with the body map instead of floating against an
 * unreachable imagined ceiling.
 *
 * - `stimulus`: the focus-weighted average "dose adequacy" of the muscles you
 *   trained as a prime mover — i.e. how close, on average, your targeted
 *   muscles are to an optimal weekly dose (net ≈ OPTIMAL_NET). This is the
 *   numeric summary of the body map: more green muscles ⇒ higher stimulus.
 * - `headroom`: remaining productive capacity across the muscles you trained.
 *   Low headroom means those muscles are near their weekly ceiling (prioritise
 *   recovery); high means there is room to add volume. Untrained muscles are
 *   excluded so a sparse split no longer reads as "fully recovered".
 */
export function computeDashboardDials(analysis: AnalysisResponse): {
  stimulus: number;
  headroom: number;
} {
  const trainedMuscles = analysis.muscles.filter((muscle) => muscle.stimulus > 0);

  // Targeted = muscles you trained as a prime mover. Falls back to all trained
  // muscles so the dial is never empty when prime-mover data is sparse.
  const primeMovers = trainedMuscles.filter((muscle) => muscle.prime_sets > 0);
  const targetedMuscles = primeMovers.length ? primeMovers : trainedMuscles;

  const focusWeight = (muscle: MuscleStats): number => {
    const contributionSets =
      muscle.prime_sets + muscle.secondary_sets + muscle.tertiary_sets;
    const primeShare = contributionSets > 0 ? muscle.prime_sets / contributionSets : 0;
    return 1 + primeShare * FOCUS_PRIME_BONUS;
  };

  // Stimulus: focus-weighted mean adequacy (0–1) over targeted muscles.
  let weightedAdequacy = 0;
  let weightSum = 0;
  for (const muscle of targetedMuscles) {
    const w = focusWeight(muscle);
    weightedAdequacy += stimulusAdequacy(muscle.net_stimulus) * w;
    weightSum += w;
  }
  const stimulus = weightSum > 0 ? Math.round((weightedAdequacy / weightSum) * 100) : 0;

  // Headroom: 1 - mean fatigue over the muscles actually trained. No trained
  // muscles ⇒ fully rested (100).
  const meanFatigue = trainedMuscles.length
    ? trainedMuscles.reduce((sum, muscle) => sum + muscleFatigue(muscle.net_stimulus), 0) /
      trainedMuscles.length
    : 0;
  const headroom = Math.round(Math.min(100, Math.max(0, 1 - meanFatigue) * 100));

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
