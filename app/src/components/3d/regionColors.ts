import { colors } from '../../theme/colors';

// The 3D body shares the canonical 0–7 stimulus ramp (see theme/colors.ts and
// src/analysis/stimulusScale.ts) so the body map, the 2D muscle map, and the
// dials all agree at every level. Per-region distinctness is preserved via the
// small hue/brightness offset applied in getRegionHex, not by separate palettes.
const HEAT_RAMP = colors.stimulus;

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
 * Uses the canonical 0-7 heat ramp with a slight per-region tint shift so
 * adjacent muscles remain visually distinct at the same stimulus level.
 * Level 0 (at/below maintenance or untrained) stays neutral so it blends with
 * the light body model rather than reading as a false positive.
 */
export function getRegionHex(
  regionId: string,
  stimulusLevels: Record<string, number>
): string {
  const raw = stimulusLevels[regionId];
  const level = Number.isFinite(raw) ? Math.min(7, Math.max(0, Math.round(raw))) : 0;
  if (level === 0) return '#f1ece4';
  return adjustHex(HEAT_RAMP[level], getRegionShadeOffset(regionId));
}

/** Neutral color for decorative (non-region) body parts */
export const NEUTRAL_HEX = '#e7e1d8';

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
