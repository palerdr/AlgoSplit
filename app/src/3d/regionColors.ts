// Stimulus heatmap scale (0–7). Cool gray (no recent work) deepening into
// green (high stimulus). Level 0 stays near the body's neutral tone so an
// untrained muscle blends into the figure instead of reading as data.
export const HEAT_RAMP = [
  '#e7e1d8', // 0 - untouched
  '#4A6076', // 1 - minimal
  '#3C9A91', // 2 - low
  '#6FE49A', // 3 - building
  '#41C46E', // 4 - moderate
  '#23A24A', // 5 - good
  '#147E36', // 6 - high
  '#0A5E27', // 7 - optimal
] as const;

/** Neutral color for decorative (non-region) body parts */
export const NEUTRAL_HEX = '#e7e1d8';

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function adjustHex(hex: string, delta: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `#${clampChannel(r + delta).toString(16).padStart(2, '0')}${clampChannel(g + delta)
    .toString(16)
    .padStart(2, '0')}${clampChannel(b + delta).toString(16).padStart(2, '0')}`;
}

// Slight deterministic per-region tint so adjacent muscles at the same
// stimulus level remain visually distinct.
function getRegionShadeOffset(regionId: string): number {
  let hash = 0;
  for (let i = 0; i < regionId.length; i++) {
    hash = (hash * 19 + regionId.charCodeAt(i)) % 5;
  }
  return (hash - 2) * 6;
}

export function getRegionHex(
  regionId: string,
  stimulusLevels: Record<string, number>
): string {
  const raw = stimulusLevels[regionId];
  const level = Number.isFinite(raw) ? Math.min(7, Math.max(0, Math.round(raw))) : 0;
  if (level === 0) return HEAT_RAMP[0];
  return adjustHex(HEAT_RAMP[level], getRegionShadeOffset(regionId));
}

/** All 28 visible muscle region IDs in the segmented body model */
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

export type RegionId = (typeof VISIBLE_REGION_IDS)[number];
