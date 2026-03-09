import type { MuscleStats, AnalysisResponse } from '../types/api.types';

/**
 * Convert muscle stats array to stimulus levels keyed by region_id.
 * Region IDs match the 3D body model 1:1.
 */
export function musclesToStimulusLevels(
  muscles: MuscleStats[],
): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const m of muscles) {
    levels[m.region_id] = m.net_stimulus;
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
  const { avg_net_stimulus, total_sets, muscles_trained, total_muscles } = analysis.summary;

  // Stimulus: avg_net_stimulus / 7 * 100 (7 = optimal target)
  const stimulus = Math.round(Math.min(100, (avg_net_stimulus / 7) * 100));

  // Fatigue: total_sets / 60 * 100 (60 sets = high fatigue ceiling)
  const fatigue = Math.round(Math.min(100, (total_sets / 60) * 100));

  // Recovery: blend of coverage and inverse fatigue
  const coverage = total_muscles > 0 ? muscles_trained / total_muscles : 0;
  const inverseFatigue = 1 - fatigue / 100;
  const recovery = Math.round(Math.min(100, (coverage * 0.6 + inverseFatigue * 0.4) * 100));

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
