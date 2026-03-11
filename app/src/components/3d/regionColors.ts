const HEAT_VARIANTS = [
  ['#232323', '#8B1E1E', '#C62828', '#E65100', '#F59E0B', '#FDE047', '#84CC16', '#16A34A'],
  ['#232323', '#7F1D1D', '#B91C1C', '#EA580C', '#F59E0B', '#FACC15', '#65A30D', '#15803D'],
  ['#232323', '#991B1B', '#DC2626', '#F97316', '#EAB308', '#FDE047', '#A3E635', '#22C55E'],
  ['#232323', '#7A2020', '#C53030', '#DD6B20', '#D69E2E', '#ECC94B', '#7FBF2A', '#2F855A'],
] as const;

const REGION_VARIANTS: Record<string, number> = {
  clavicular: 0,
  sternocostal: 1,
  anterior_deltoid: 2,
  lateral_deltoid: 3,
  posterior_deltoid: 0,
  trapezius: 1,
  rhomboids: 2,
  thoracic_lats: 3,
  iliac_lats: 0,
  spinal_erectors: 1,
  biceps_brachii: 2,
  brachialis: 3,
  triceps_long_head: 0,
  triceps_lateral_medial: 1,
  brachioradialis: 2,
  wrist_flexors: 3,
  wrist_extensors: 0,
  anterior_core: 1,
  lateral_core: 2,
  glute_max: 3,
  glute_med_min: 0,
  rectus_femoris: 1,
  vasti: 2,
  hip_extensors: 3,
  knee_flexors: 0,
  hip_adductors: 1,
  gastrocnemius: 2,
  soleus: 3,
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function adjustHex(hex: string, delta: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `#${clampChannel(r + delta).toString(16).padStart(2, '0')}${clampChannel(
    g + delta,
  )
    .toString(16)
    .padStart(2, '0')}${clampChannel(b + delta).toString(16).padStart(2, '0')}`;
}

function getRegionShadeOffset(regionId: string): number {
  let hash = 0;
  for (let i = 0; i < regionId.length; i++) {
    hash = (hash * 19 + regionId.charCodeAt(i)) % 5;
  }
  return (hash - 2) * 6;
}

/**
 * Get hex color for a muscle region based on its stimulus level.
 * Returns a body-specific heat scale (0-7) with a slight per-region tint shift
 * so adjacent muscles remain visually distinct at the same stimulus level.
 */
export function getRegionHex(
  regionId: string,
  stimulusLevels: Record<string, number>
): string {
  const level = Math.min(7, Math.max(0, Math.round(stimulusLevels[regionId])));
  const variant = REGION_VARIANTS[regionId] ?? 0;
  return adjustHex(HEAT_VARIANTS[variant][level], getRegionShadeOffset(regionId));
}

/** Neutral color for decorative (non-region) body parts */
export const NEUTRAL_HEX = '#232323';

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
