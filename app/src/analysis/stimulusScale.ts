/**
 * Canonical stimulus scale — single source of truth for how the engine's
 * `net_stimulus` is turned into heat levels, colors, and dial values.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The body map, the 2D muscle map, the performance dials, and the region bar
 * chart all translate `net_stimulus` into something a human can read.
 * Previously each component did its own thing with its own constants, all
 * calibrated for an imagined `net_stimulus` range of 0–4. The engine does
 * NOT produce that range. Measured across the four baseline split fixtures
 * (backend/tests/fixtures/analysis_engine_main_baseline.json, 93 trained-
 * muscle observations):
 *
 *     median trained muscle   net ≈ 0.26
 *     p75                      net ≈ 0.89
 *     p90                      net ≈ 1.74
 *     p95                      net ≈ 2.13
 *     max ever (best muscle)   net ≈ 2.74
 *
 * The constants below are anchored to documented physiological reference
 * points, not fixture percentiles (percentile anchors would rot if the
 * engine's curves change). Cite this file when you change them; do not
 * tweak values in consumer modules.
 *
 *     net = 0   →  maintenance line. Defined by the engine as
 *                  `net_weekly_stimulus = stimulus − atrophy` (MainClasses.py:509),
 *                  with atrophy calibrated to `maintenance_volume`. net = 0 is
 *                  the volume that exactly offsets the week's atrophy.
 *     net 1.3   →  start of the "Growing" band (level 5). Represents a muscle
 *                  whose net signal is meaningfully above noise and into
 *                  productive growth territory.
 *     net 1.8   →  OPTIMAL_NET. Anchor for the Stimulus dial. A muscle hitting
 *                  this is solidly in the green band; "100" on the dial means
 *                  every trained muscle is at least here. Reachable for
 *                  prioritised muscles in a well-designed split (PPL fixture
 *                  has 5 muscles at or above this).
 *     net 2.5   →  HEADROOM_CEILING. Just above the empirically observed max
 *                  (~2.74) — a single muscle saturating it consumes its full
 *                  weekly recovery budget.
 *     net 2.3+  →  "Optimal" band (level 7). Top ~3% of muscles in reference
 *                  splits; achievable but rare.
 */

import { colors } from '../theme/colors';

// ── Band thresholds (upper bound of each level, on net_stimulus) ────────────
// Bands are inclusive on the upper bound (`net <= T[i]` → level i). Level 0
// covers net <= 0 (at or below maintenance).
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

/**
 * Net stimulus at which a muscle's Stimulus-dial contribution saturates at 100%.
 *
 * Anchored to the start of the "Growing" band (level 5 upper bound). The dial
 * reads 100 when every trained muscle is in productive-growth territory or
 * above. Tuning consequences: in fixture splits a strong split lands in the
 * 40–70 range, which is honest — those splits are not "perfect."
 */
export const OPTIMAL_NET = 1.8;

// HEADROOM_CEILING was used by the prior volume-based "Headroom" dial. The
// Recovery dial is now time-based and reads `recovery_readiness` straight off
// the backend, so this constant has no consumers. Intentionally removed; do
// not reintroduce a volume-based recovery proxy without explicit design.

/**
 * Map a net weekly stimulus value to a 0–7 heat level.
 *
 * Anchored to the engine's real output (see file header). net <= 0 is the
 * maintenance line; the green range (levels 5–7) corresponds to net ≥ 1.3,
 * which is what a well-trained muscle in a strong split actually reaches.
 *
 * Defensive against non-finite inputs (NaN/null/undefined → level 0) so a
 * malformed backend payload renders neutrally instead of crashing the body.
 */
export function getStimulusLevel(netStimulus: number): number {
  if (!Number.isFinite(netStimulus)) return 0;
  // STIMULUS_THRESHOLDS[0] = 0 anchors level 0 to "at or below maintenance",
  // so the loop covers every band — no separate short-circuit needed.
  for (let level = 0; level < STIMULUS_THRESHOLDS.length; level++) {
    if (netStimulus <= STIMULUS_THRESHOLDS[level]) return level;
  }
  return MAX_STIMULUS_LEVEL;
}

/** Back-compat alias used by the dev parity checker / 3D transforms. */
export const computeStimulusLevel = getStimulusLevel;

/**
 * How close a muscle is to an optimal weekly dose, as a 0–1 fraction.
 * Drives the Stimulus dial. Continuous, monotonic, saturates at OPTIMAL_NET.
 */
export function stimulusAdequacy(netStimulus: number): number {
  if (!Number.isFinite(netStimulus) || netStimulus <= 0) return 0;
  return Math.min(1, netStimulus / OPTIMAL_NET);
}

// (Per-muscle readiness normalization lives in computeDashboardDials, which
//  *excludes* muscles with a missing reading from the stimulus-weighted mean
//  rather than treating missing as fully ready. An earlier `muscleReadiness`
//  helper here encoded the opposite ("missing → 1.0") and had no production
//  consumer; it was removed to avoid two divergent definitions of the rule.)

// ── Legend metadata ─────────────────────────────────────────────────────────
// Bands worth labelling for the on-screen legend. `level` is the heat level
// the label refers to and is also used by StimulusLegend to position the label
// directly under its band in the ramp.
export interface StimulusBand {
  label: string;
  /** Heat level (0–7) this label refers to. */
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
  const clamped = Number.isFinite(level)
    ? Math.min(Math.max(0, Math.round(level)), MAX_STIMULUS_LEVEL)
    : 0;
  return colors.stimulus[clamped];
}

/** Color for a raw net_stimulus value (convenience for bar charts). */
export function getStimulusColorForNet(netStimulus: number): string {
  return getStimulusColor(getStimulusLevel(netStimulus));
}
