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
  const avgActiveStimulus = activeMuscles.length
    ? activeMuscles.reduce((sum, muscle) => sum + muscle.net_stimulus, 0) / activeMuscles.length
    : 0;
  const avgRawStimulus = activeMuscles.length
    ? activeMuscles.reduce((sum, muscle) => sum + muscle.stimulus, 0) / activeMuscles.length
    : 0;
  const workloadDensity = Math.min(1, total_sets / 18);
  const coverage = total_muscles > 0 ? muscles_trained / total_muscles : 0;
  const recoveryReserve = analysis.muscles.length
    ? analysis.muscles.reduce((sum, muscle) => {
        const unresolved = Math.min(1, Math.max(0, muscle.net_stimulus) / 4);
        return sum + (1 - unresolved);
      }, 0) / analysis.muscles.length
    : 1;

  // Stimulus: average active-muscle stimulus normalized to the same 0-4 scale
  // used by the body heatmap buckets. This avoids diluting a fresh split
  // across every muscle in the body.
  const stimulus = Math.round(Math.min(100, (avgActiveStimulus / 4) * 100));

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
