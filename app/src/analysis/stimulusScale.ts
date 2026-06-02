/**
 * Canonical stimulus scale — single source of truth for how the engine's
 * `net_stimulus` is turned into heat levels, colors, and dial values.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The body map, the 2D muscle map, the performance dials, and the region
 * bar chart all need to translate `net_stimulus` into something a human can
 * read. Historically each did its own thing with its own magic numbers, and
 * those numbers were calibrated for an imagined `net_stimulus` range of ~0–4.
 *
 * The engine does NOT produce that range. Measured across the four baseline
 * split fixtures (backend/tests/fixtures/analysis_engine_main_baseline.json,
 * 93 trained-muscle observations):
 *
 *     median trained muscle   net ≈ 0.26
 *     p90                      net ≈ 1.74
 *     p95                      net ≈ 2.13
 *     max ever (best muscle)   net ≈ 2.74
 *
 * The old thresholds only turned "green" at net ≥ 2.5 and "optimal" at
 * net ≥ 4.0 — values the engine essentially never outputs — so the body map
 * was perpetually cold no matter how good the split was. These thresholds are
 * re-anchored to the engine's real, physiologically meaningful scale:
 *
 *     net = 0   →  maintenance line (stimulus == atrophy; no growth, no loss)
 *                  See MainClasses.py:509 `net_weekly_stimulus = stimulus - atrophy`
 *                  and apply_atrophy (calibrated to maintenance_volume).
 *     net 0–1   →  modest growth
 *     net 1–2   →  solid, productive growth (this is where a prioritized
 *                  muscle in a good split actually lands)
 *     net 2.3+  →  near the practical weekly ceiling (top ~5% of muscles)
 *
 * Keep this file as the only place these constants live.
 */

import { colors } from '../theme/colors';

// ── Band thresholds (upper bound of each level, on net_stimulus) ────────────
// Level is the index of the first band whose upper bound `net` does not exceed.
// Level 0 = at or below maintenance (net <= 0).
export const STIMULUS_THRESHOLDS = [
  0.0, // <= 0    level 0  maintaining or below
  0.3, // <= 0.3  level 1  minimal
  0.6, // <= 0.6  level 2  low
  0.9, // <= 0.9  level 3  building
  1.3, // <= 1.3  level 4  moderate
  1.8, // <= 1.8  level 5  good      (visually "green")
  2.3, // <= 2.3  level 6  high
  // > 2.3        level 7  optimal
] as const;

export const MAX_STIMULUS_LEVEL = 7;

/** Net stimulus at/above which a muscle is at 100% of an optimal weekly dose. */
export const OPTIMAL_NET = 2.3; // == level-7 threshold; keeps dial coupled to map

/** Net stimulus treated as "fully using" a muscle's weekly recovery budget. */
export const HEADROOM_CEILING = 2.5; // practical ceiling (observed max ≈ 2.74)

/** Extra weight given to a muscle's prime-mover share when scoring the dial. */
export const FOCUS_PRIME_BONUS = 0.35;

/**
 * Map a net weekly stimulus value to a 0–7 heat level.
 *
 * Anchored to the engine's real output (see file header). net <= 0 is the
 * maintenance line; the green range (levels 5–7) corresponds to net ~1.3–2.3+,
 * which is what a well-trained muscle actually reaches.
 */
export function getStimulusLevel(netStimulus: number): number {
  // Level 0 is reserved for at/below maintenance.
  if (netStimulus <= STIMULUS_THRESHOLDS[0]) return 0;
  for (let level = 1; level < STIMULUS_THRESHOLDS.length; level++) {
    if (netStimulus <= STIMULUS_THRESHOLDS[level]) return level;
  }
  return MAX_STIMULUS_LEVEL;
}

/** Back-compat alias used by the dev parity checker / 3D transforms. */
export const computeStimulusLevel = getStimulusLevel;

/**
 * How close a muscle is to an optimal weekly dose, as a 0–1 fraction.
 * Drives the Stimulus dial. Continuous (no band-crossing jumps).
 */
export function stimulusAdequacy(netStimulus: number): number {
  if (netStimulus <= 0) return 0;
  return Math.min(1, netStimulus / OPTIMAL_NET);
}

/**
 * How much of a muscle's weekly recovery budget has been consumed, 0–1.
 * Drives the Headroom dial (headroom = 1 - mean fatigue over trained muscles).
 */
export function muscleFatigue(netStimulus: number): number {
  if (netStimulus <= 0) return 0;
  return Math.min(1, netStimulus / HEADROOM_CEILING);
}

// ── Legend metadata ─────────────────────────────────────────────────────────
// Collapsed into the bands worth labelling for a compact on-screen legend.
export interface StimulusBand {
  label: string;
  /** Representative level used to pull the swatch color. */
  level: number;
  /** Lower bound of net_stimulus for this band (inclusive). */
  minNet: number;
}

export const STIMULUS_LEGEND: StimulusBand[] = [
  { label: 'Maintain', level: 0, minNet: Number.NEGATIVE_INFINITY },
  { label: 'Building', level: 3, minNet: STIMULUS_THRESHOLDS[2] },
  { label: 'Growing', level: 5, minNet: STIMULUS_THRESHOLDS[4] },
  { label: 'Optimal', level: 7, minNet: STIMULUS_THRESHOLDS[6] },
];

/** Color for a 0–7 heat level, from the canonical theme ramp. */
export function getStimulusColor(level: number): string {
  return colors.stimulus[Math.min(Math.max(0, Math.round(level)), MAX_STIMULUS_LEVEL)];
}

/** Color for a raw net_stimulus value (convenience for bar charts). */
export function getStimulusColorForNet(netStimulus: number): string {
  return getStimulusColor(getStimulusLevel(netStimulus));
}
