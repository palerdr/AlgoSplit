/**
 * Consolidated client-side analysis transforms.
 *
 * Re-exports existing transforms and adds new type-safe wrappers
 * for stimulus computations that may migrate from Python to TS.
 *
 * MIGRATION RULE: Do NOT remove any Python code. These functions
 * exist alongside the server implementation for parity validation.
 */

import type {
  MuscleStats,
  MuscleGroupSummary,
  AnalysisResponse,
  OptimizationSuggestion,
} from '../types/api.types';

// ── Re-exports from existing modules ────────────────────────────
export {
  musclesToStimulusLevels,
  computeDashboardDials,
  generateInsights,
} from '../utils/analysisTransform';

// ── Stimulus level bucketing ────────────────────────────────────

/**
 * Map net_stimulus to a 0-7 heat level for the 3D body model.
 *
 * Mirrors Python: there is no direct Python equivalent exported
 * to the client — this logic only exists in TS. The thresholds
 * were chosen to align with the empirical stimulus curves.
 *
 * @param netStimulus - The net weekly stimulus value (stimulus - atrophy)
 * @returns Integer 0-7 where 0 = no stimulus, 7 = very high stimulus
 */
export function computeStimulusLevel(netStimulus: number): number {
  if (netStimulus <= 0) return 0;
  if (netStimulus < 0.5) return 1;
  if (netStimulus < 1.0) return 2;
  if (netStimulus < 1.75) return 3;
  if (netStimulus < 2.5) return 4;
  if (netStimulus < 3.25) return 5;
  if (netStimulus < 4.0) return 6;
  return 7;
}

// ── Group summary derivation ────────────────────────────────────

/**
 * Derive muscle group summaries from the per-region muscle stats.
 *
 * The server already returns `group_summaries` in the AnalysisResponse,
 * but this function lets the client independently compute the same result
 * from `muscles[]`. This is the first candidate for migration: if the
 * client computes it, the server can stop including `group_summaries`
 * in the response payload (saving ~200 bytes and server compute).
 *
 * Mirrors Python: `_build_response` in `analysis_routes.py:309-321`
 *
 * @param muscles - Array of MuscleStats from server response
 * @returns Array of MuscleGroupSummary, sorted by group name
 */
export function computeGroupSummaries(
  muscles: MuscleStats[],
): MuscleGroupSummary[] {
  const byGroup = new Map<
    string,
    { totalNet: number; totalSets: number; regions: string[] }
  >();

  for (const m of muscles) {
    const existing = byGroup.get(m.parent_group);
    if (existing) {
      existing.totalNet += m.net_stimulus;
      existing.totalSets += m.primary_sets;
      existing.regions.push(m.region_id);
    } else {
      byGroup.set(m.parent_group, {
        totalNet: m.net_stimulus,
        totalSets: m.primary_sets,
        regions: [m.region_id],
      });
    }
  }

  const summaries: MuscleGroupSummary[] = [];
  for (const [group, data] of byGroup) {
    summaries.push({
      group,
      total_net_stimulus: data.totalNet,
      total_sets: data.totalSets,
      regions: data.regions,
    });
  }

  summaries.sort((a, b) => a.group.localeCompare(b.group));
  return summaries;
}

// ── Summary stats derivation ────────────────────────────────────

/**
 * Derive summary statistics from per-region muscle stats.
 *
 * Mirrors Python: `_build_response` in `analysis_routes.py:327-338`
 *
 * @param muscles - Array of MuscleStats from server response
 * @param totalMuscleCount - Total number of muscle regions (default 29)
 * @returns Summary statistics object
 */
export function computeSummaryStats(
  muscles: MuscleStats[],
  totalMuscleCount = 29,
): {
  totalSets: number;
  musclesTrained: number;
  totalMuscles: number;
  avgNetStimulus: number;
  avgSetsPerMuscle: number;
} {
  const totalSets = muscles.reduce((sum, m) => sum + m.primary_sets, 0);
  const musclesTrained = muscles.filter((m) => m.stimulus > 0).length;
  const trainedMuscles = muscles.filter((m) => m.stimulus > 0);
  const avgNetStimulus =
    trainedMuscles.length > 0
      ? trainedMuscles.reduce((sum, m) => sum + m.net_stimulus, 0) /
        trainedMuscles.length
      : 0;

  return {
    totalSets,
    musclesTrained,
    totalMuscles: totalMuscleCount,
    avgNetStimulus,
    avgSetsPerMuscle:
      musclesTrained > 0 ? totalSets / musclesTrained : 0,
  };
}

// ── Suggestion generation (client-side mirror) ──────────────────

/**
 * Generate optimization suggestions from muscle stats.
 *
 * This mirrors the Python `_generate_suggestions` in
 * `analysis_routes.py:357-414`. The logic is pure threshold-based
 * and does not depend on any server state.
 *
 * Currently the server generates suggestions and includes them in the
 * response. This TS version exists for parity validation; once parity
 * is confirmed, the server can stop computing suggestions.
 *
 * @param muscles - Array of MuscleStats from server response
 * @param maintenanceVolume - Baseline maintenance volume (default 3)
 * @returns Array of optimization suggestions
 */
export function computeSuggestions(
  muscles: MuscleStats[],
  maintenanceVolume = 3,
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const m of muscles) {
    const name = m.display_name;
    const net = m.net_stimulus;
    const sets = m.primary_sets;
    const freq = m.frequency;
    const atrophy = m.atrophy;
    const stimulus = m.stimulus;

    // Under-stimulated
    if (net < 1.0 && stimulus > 0) {
      suggestions.push({
        priority: 'HIGH',
        muscle: name,
        issue: 'Under-stimulated',
        suggestion: `Net stimulus is only ${net.toFixed(2)}. Consider adding 2-4 more sets or increasing frequency.`,
      });
    } else if (net < 2.0 && stimulus > 0) {
      suggestions.push({
        priority: 'MEDIUM',
        muscle: name,
        issue: 'Low stimulus',
        suggestion: `Net stimulus is ${net.toFixed(2)}. Could benefit from 1-2 additional sets.`,
      });
    }

    // Untrained
    if (sets === 0 && stimulus === 0) {
      suggestions.push({
        priority: 'HIGH',
        muscle: name,
        issue: 'Not trained',
        suggestion: `No direct training. Add at least ${maintenanceVolume} sets per week.`,
      });
    }

    // Over-trained
    if (sets > 12) {
      suggestions.push({
        priority: 'MEDIUM',
        muscle: name,
        issue: 'Excessive volume',
        suggestion: `Weekly volume is ${sets} sets. Consider reducing to 8-12 sets.`,
      });
    }

    // High atrophy ratio
    if (stimulus > 0 && atrophy > 0) {
      const atrophyRatio = atrophy / stimulus;
      if (atrophyRatio > 0.4 && freq <= 1) {
        suggestions.push({
          priority: 'HIGH',
          muscle: name,
          issue: 'High atrophy',
          suggestion: `Atrophy is ${(atrophyRatio * 100).toFixed(1)}% of stimulus. Increase frequency to 2x per week.`,
        });
      }
    }
  }

  return suggestions;
}
