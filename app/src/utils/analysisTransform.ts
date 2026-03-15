import type { MuscleStats, AnalysisResponse } from '../types/api.types';
import { getStimulusLevel } from '../lib/utils';

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
 */
export function computeDashboardDials(analysis: AnalysisResponse): {
  stimulus: number;
  fatigue: number;
  recovery: number;
} {
  const { total_sets, muscles_trained, total_muscles } = analysis.summary;
  const activeMuscles = analysis.muscles.filter((muscle) => muscle.net_stimulus > 0);
  const avgRawStimulus = activeMuscles.length
    ? activeMuscles.reduce((sum, muscle) => sum + muscle.stimulus, 0) / activeMuscles.length
    : 0;
  const meaningfullyTrainedMuscles = analysis.muscles.filter((muscle) => muscle.net_stimulus >= 1);
  const weightedStimulusScore = meaningfullyTrainedMuscles.length
    ? meaningfullyTrainedMuscles.reduce((sum, muscle) => {
        const totalContributionSets = muscle.prime_sets + muscle.secondary_sets + muscle.tertiary_sets;
        const primeShare = totalContributionSets > 0 ? muscle.prime_sets / totalContributionSets : 0;
        const focusWeight = 1 + primeShare * 0.5;
        return sum + muscle.net_stimulus * focusWeight;
      }, 0) /
      meaningfullyTrainedMuscles.reduce((sum, muscle) => {
        const totalContributionSets = muscle.prime_sets + muscle.secondary_sets + muscle.tertiary_sets;
        const primeShare = totalContributionSets > 0 ? muscle.prime_sets / totalContributionSets : 0;
        return sum + (1 + primeShare * 0.5);
      }, 0)
    : 0;
  const workloadDensity = Math.min(1, total_sets / 18);
  const coverage = total_muscles > 0 ? muscles_trained / total_muscles : 0;
  const recoveryReserve = analysis.muscles.length
    ? analysis.muscles.reduce((sum, muscle) => {
        const unresolved = Math.min(1, Math.max(0, muscle.net_stimulus) / 4);
        return sum + (1 - unresolved);
      }, 0) / analysis.muscles.length
    : 1;
  const meaningfulCoverage = meaningfullyTrainedMuscles.length;
  const coverageScore = Math.min(1, meaningfulCoverage / 18);
  const stimulusQuality = Math.min(1, weightedStimulusScore / 2.4);
  const specializationBonus = meaningfulCoverage >= 14 ? 1 : meaningfulCoverage >= 10 ? 0.92 : 0.8;
  const undercoveragePenalty = meaningfulCoverage >= 18 ? 1 : meaningfulCoverage >= 12 ? 0.96 : 0.85;

  // Stimulus: score the muscles that are actually being trained well, then
  // reward strong target-region quality and let 18-20 well-trained regions
  // score highly without demanding all 29 regions be emphasized equally.
  const stimulus = Math.round(
    Math.min(100, (stimulusQuality * 0.7 + coverageScore * 0.3) * specializationBonus * undercoveragePenalty * 100),
  );

  // Fatigue: session workload density + raw per-muscle stress + body coverage.
  // This reflects "how much stress was imposed" rather than simply mirroring recovery.
  const fatigue = Math.round(
    Math.min(100, (workloadDensity * 0.45 + Math.min(1, avgRawStimulus / 5) * 0.4 + coverage * 0.15) * 100),
  );

  // Recovery: remaining headroom from current net stimulus across the whole body.
  // Muscles with little or no unresolved net stimulus stay close to fully recovered.
  const recovery = Math.round(Math.min(100, recoveryReserve * 100));

  return { stimulus, fatigue, recovery };
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
