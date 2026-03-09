import { colors } from '../../theme';

/**
 * Get hex color for a muscle region based on its stimulus level.
 * Returns the theme stimulus color (0-7 scale).
 */
export function getRegionHex(
  regionId: string,
  stimulusLevels: Record<string, number>
): string {
  if (!(regionId in stimulusLevels)) return colors.stimulus[0];
  const level = Math.min(7, Math.max(0, Math.round(stimulusLevels[regionId])));
  return colors.stimulus[level];
}

/** Neutral color for decorative (non-region) body parts */
export const NEUTRAL_HEX = '#2A2A2A';

/** All 28 visible muscle region IDs (deep_core excluded) */
export const VISIBLE_REGION_IDS = [
  // Chest
  'clavicular', 'sternocostal',
  // Shoulders
  'anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid',
  // Upper back
  'trapezius', 'rhomboids',
  // Lats
  'thoracic_lats', 'iliac_lats',
  // Lower back
  'spinal_erectors',
  // Biceps
  'biceps_brachii', 'brachialis',
  // Triceps
  'triceps_long_head', 'triceps_lateral_medial',
  // Forearms
  'brachioradialis', 'wrist_flexors', 'wrist_extensors',
  // Core
  'anterior_core', 'lateral_core',
  // Glutes
  'glute_max', 'glute_med_min',
  // Quads
  'rectus_femoris', 'vasti',
  // Hamstrings
  'hip_extensors', 'knee_flexors',
  // Adductors
  'hip_adductors',
  // Calves
  'gastrocnemius', 'soleus',
] as const;
