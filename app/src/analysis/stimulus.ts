/**
 * Stimulus engine — ported from AlgoSplit (backend/core).
 *
 * Ported features:
 * 1. TIERED STIMULUS with empirical diminishing returns (MainClasses.py
 *    apply_stimulus + stimulus_tiers.py): per-set stimulus = weight ×
 *    marginal(setIndex) on the Schoenfeld/Pelland curves; prime movers ride
 *    the full curve, secondary/tertiary/quaternary get beta-softened versions.
 * 2. CANONICAL SCALE (stimulusScale.ts): net → 0–7 heat levels, OPTIMAL_NET,
 *    adequacy and the 0–100 stimulus score.
 * 3. RECOVERY PENALTY: re-training a muscle inside its window scales stimulus
 *    by hours/window; windows are per-muscle (48h × recovery_modifier).
 * 4. CNS FATIGUE (fatigue_modifiers.calculate_cns_fatigue): 0.85 + 0.15 ×
 *    exp(−0.06 × effective_sets), with axial load feeding effective sets at
 *    2.5 set-equivalents per unit.
 * 5. UNILATERAL BONUS (+5%) per fatigue_modifiers.
 * 6. LEVERAGE REDISTRIBUTION (MainClasses.redistribute_leverage_weights):
 *    muscles mismatched to the exercise's resistance profile lose stimulus,
 *    conserved and redistributed to perfectly-matched muscles.
 * 7. ATROPHY + WEEKLY STEADY STATE (MainClasses.apply_atrophy /
 *    simulate_split): net = stimulus − atrophy, atrophy accruing outside the
 *    stimulus window at maintenance-volume rate — enables analyzing a
 *    TEMPLATE's steady-state, not just logged history.
 * 8. e1RM (Brzycki), for progress tracking.
 *
 * Not yet ported: consecutive-day penalties, movement-pattern MATCHING (we
 * resolve the catalog through patterns statically), split import.
 */

import { Exercise } from '../data/exercises';
import { MUSCLE_REGIONS } from '../data/muscleRegions.gen';

// ── Empirical data curves (Schoenfeld & Pelland meta-analyses) ──────────────
export const SCHOENFELD = [1.0, 1.39, 1.61, 1.77, 1.9, 2.0, 2.09, 2.16, 2.23];
export const PELLAND = [1.0, 1.89, 2.5, 3.07, 3.56, 4.0, 4.4, 4.78, 5.16];
export const AVG = SCHOENFELD.map((s, i) => (s + PELLAND[i]) / 2);

// Marginal gains per set (diminishing returns), 'average' dataset.
const MARGINALS = AVG.map((v, i) => (i === 0 ? v : v - AVG[i - 1]));

/** Marginal multiplier for the k-th set (0-indexed) hitting a muscle. */
export function marginalAt(k: number): number {
  if (k < 9) return MARGINALS[k];
  // Beyond set 9, continue with very small decay (MainClasses.py:356)
  return MARGINALS[8] * Math.pow(0.97, k - 8);
}

// Beta values for residual_local_multiplier by tier (stimulus_tiers.py)
export type StimulusTier = 'prime' | 'secondary' | 'tertiary' | 'quaternary';
export const TIER_BETA: Record<StimulusTier, number> = {
  prime: 1.0,
  secondary: 0.55,
  tertiary: 0.35,
  quaternary: 0.15,
};

// Minimum stimulus weight per tier — filters pattern noise (stimulus_tiers.py)
export const TIER_MINIMUM_WEIGHT: Record<StimulusTier, number> = {
  prime: 0.0,
  secondary: 0.05,
  tertiary: 0.02,
  quaternary: 0.01,
};

/** Softened marginal curve for non-prime movers (MainClasses.py:341). */
export function residualLocalMultiplier(k: number, beta: number): number {
  return 1.0 - beta * (1.0 - marginalAt(k));
}

// ── Systemic fatigue (fatigue_modifiers.py) ─────────────────────────────────

const CNS_FLOOR = 0.85;
const CNS_RANGE = 0.15;
const CNS_DECAY = 0.06;
const AXIAL_CNS_EQUIV_SETS = 2.5;
const AXIAL_SET_CONTRIBUTION = 0.15;
const UNILATERAL_BONUS = 1.05;

/** CNS multiplier: ~1.0 fresh, asymptotically decaying toward 0.85. */
export function cnsFatigueMult(globalSetNumber: number, axialFatigue = 0): number {
  const effectiveSets = globalSetNumber + axialFatigue * AXIAL_CNS_EQUIV_SETS;
  return CNS_FLOOR + CNS_RANGE * Math.exp(-CNS_DECAY * effectiveSets);
}

// ── Leverage matching (MainClasses.py LEVERAGE_MATCH_MULTIPLIERS) ───────────

const LEVERAGE_MATCH: Record<string, Record<string, number>> = {
  S: { ascending: 1.0, mid: 0.85, descending: 0.7 },
  M: { ascending: 0.85, mid: 1.0, descending: 0.85 },
  L: { ascending: 0.7, mid: 0.85, descending: 1.0 },
};

export function getLeverageMultiplier(leverage: string, profile: string): number {
  return LEVERAGE_MATCH[leverage]?.[profile] ?? 0.85;
}

/**
 * Tier-agnostic leverage redistribution: mismatched muscles' lost stimulus is
 * conserved and flows to perfectly-matched muscles, weighted by their kept
 * stimulus. Returns adjusted per-muscle weights for one exercise.
 */
export function leverageAdjustedWeights(exercise: Exercise): Map<string, number> {
  const kept = new Map<string, number>();
  const perfect: string[] = [];
  let lost = 0;
  let perfectTotal = 0;

  for (const m of exercise.muscles) {
    const leverage = MUSCLE_REGIONS[m.region]?.leverage ?? 'M';
    const mult = getLeverageMultiplier(leverage, exercise.resistanceProfile);
    const keptWeight = m.weight * mult;
    kept.set(m.region, keptWeight);
    lost += m.weight - keptWeight;
    if (mult >= 1.0) {
      perfect.push(m.region);
      perfectTotal += keptWeight;
    }
  }

  if (lost > 0 && perfect.length > 0 && perfectTotal > 0) {
    for (const region of perfect) {
      const share = (kept.get(region) ?? 0) / perfectTotal;
      kept.set(region, (kept.get(region) ?? 0) + lost * share);
    }
  }
  return kept;
}

// ── Recovery windows ────────────────────────────────────────────────────────

/** Base hours a training bout's stimulus "occupies" before atrophy/recovery reset. */
export const STIMULUS_DURATION_HOURS = 48;

/** Per-muscle window: base 48h scaled by the region's recovery modifier. */
export function regionWindowHours(region: string): number {
  return STIMULUS_DURATION_HOURS * (MUSCLE_REGIONS[region]?.recoveryModifier ?? 1);
}

export interface WorkoutStimulusOptions {
  /** Hours since each muscle was last trained (recovery penalty inside window). */
  hoursSinceByRegion?: Record<string, number>;
}

// ── Workout stimulus ────────────────────────────────────────────────────────

/**
 * Net stimulus per muscle region for one workout, applying the full ported
 * modifier chain: recovery penalty → unilateral bonus → leverage-adjusted
 * weight → tier marginal curve → CNS/axial fatigue.
 */
export function computeWorkoutStimulus(
  entries: { exercise: Exercise; sets: number }[],
  opts?: WorkoutStimulusOptions
): Record<string, number> {
  const primeCount: Record<string, number> = {};
  const residualCount: Record<string, number> = {};
  const net: Record<string, number> = {};
  let globalSet = 0;
  let axialFatigue = 0;

  const recoveryRatio = (region: string): number => {
    const h = opts?.hoursSinceByRegion?.[region];
    const window = regionWindowHours(region);
    if (h === undefined || !Number.isFinite(h) || h >= window) return 1;
    return Math.max(0, Math.min(1, h / window));
  };

  for (const { exercise, sets } of entries) {
    const adjustedWeights = leverageAdjustedWeights(exercise);
    const bilateralMod = exercise.unilateral ? UNILATERAL_BONUS : 1.0;

    for (let s = 0; s < sets; s++) {
      const gMult = cnsFatigueMult(globalSet, axialFatigue);
      globalSet += 1;
      axialFatigue += AXIAL_SET_CONTRIBUTION * exercise.axialLoad;

      for (const m of exercise.muscles) {
        if (m.weight < TIER_MINIMUM_WEIGHT[m.tier]) continue;
        const weight = adjustedWeights.get(m.region) ?? m.weight;

        let localMult: number;
        if (m.tier === 'prime') {
          const k = primeCount[m.region] ?? 0;
          localMult = marginalAt(k);
          primeCount[m.region] = k + 1;
        } else {
          const k = residualCount[m.region] ?? 0;
          localMult = residualLocalMultiplier(k, TIER_BETA[m.tier]);
          residualCount[m.region] = k + 1;
        }

        net[m.region] =
          (net[m.region] ?? 0) +
          weight * localMult * gMult * bilateralMod * recoveryRatio(m.region);
      }
    }
  }
  return net;
}

// ── Atrophy + weekly steady state (MainClasses.apply_atrophy) ───────────────

export const MAINTENANCE_VOLUME = 2; // weekly sets that offset a week's atrophy
const WEEK_HOURS = 168;

/** Atrophy per hour outside the stimulus window, calibrated so that
 *  MAINTENANCE_VOLUME weekly sets exactly offset a week of atrophy. */
export function atrophyRatePerHour(windowHours: number): number {
  const denom = WEEK_HOURS - windowHours;
  if (denom <= 0) return 0;
  return AVG[MAINTENANCE_VOLUME - 1] / denom;
}

/** Union length of [start, end) intervals clamped to one week. */
function coveredHours(intervals: [number, number][]): number {
  const sorted = intervals
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(WEEK_HOURS, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cursor = -1;
  for (const [a, b] of sorted) {
    const start = Math.max(a, cursor);
    if (b > start) {
      total += b - start;
      cursor = b;
    }
  }
  return total;
}

/**
 * Steady-state weekly net stimulus for a workout template performed
 * `timesPerWeek` times (evenly spaced): summed session stimulus (with the
 * recovery penalty between sessions) minus atrophy accrued outside each
 * muscle's stimulus windows. This is the engine's `net_weekly_stimulus` for
 * a plan rather than logged history.
 */
export function analyzeTemplate(
  entries: { exercise: Exercise; sets: number }[],
  timesPerWeek = 1
): Record<string, number> {
  const n = Math.max(1, Math.min(7, Math.round(timesPerWeek)));
  const sessionTimes = Array.from({ length: n }, (_, i) => (WEEK_HOURS / n) * i);

  const total: Record<string, number> = {};
  let lastTrainedAt: Record<string, number> | null = null;

  for (const t of sessionTimes) {
    let hoursSince: Record<string, number> | undefined;
    if (lastTrainedAt) {
      hoursSince = {};
      for (const [region, at] of Object.entries(lastTrainedAt)) {
        hoursSince[region] = t - at;
      }
    }
    const s = computeWorkoutStimulus(entries, { hoursSinceByRegion: hoursSince });
    lastTrainedAt = lastTrainedAt ?? {};
    for (const [region, value] of Object.entries(s)) {
      total[region] = (total[region] ?? 0) + value;
      lastTrainedAt[region] = t;
    }
  }

  const net: Record<string, number> = {};
  for (const [region, stim] of Object.entries(total)) {
    const window = regionWindowHours(region);
    const covered = coveredHours(sessionTimes.map((t): [number, number] => [t, t + window]));
    const atrophy = atrophyRatePerHour(window) * Math.max(0, WEEK_HOURS - covered);
    net[region] = stim - atrophy;
  }
  return net;
}

// ── Rolling decay for the home heatmap ──────────────────────────────────────

const FULL_DECAY_DAYS = 7;

/** How much of a workout's stimulus still "counts", by age in days. */
export function recoveryFactor(daysAgo: number, region?: string): number {
  const windowDays = (region ? regionWindowHours(region) : STIMULUS_DURATION_HOURS) / 24;
  if (!Number.isFinite(daysAgo) || daysAgo <= windowDays) return 1;
  if (daysAgo >= FULL_DECAY_DAYS) return 0;
  return 1 - (daysAgo - windowDays) / (FULL_DECAY_DAYS - windowDays);
}

/** Sum decayed per-workout nets into a current rolling net per muscle. */
export function rollingNet(
  workouts: { stimulus: Record<string, number>; daysAgo: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of workouts) {
    for (const [region, net] of Object.entries(w.stimulus)) {
      const f = recoveryFactor(w.daysAgo, region);
      if (f <= 0) continue;
      out[region] = (out[region] ?? 0) + net * f;
    }
  }
  return out;
}

// ── Canonical stimulus scale (stimulusScale.ts, ported) ─────────────────────

// Band thresholds (upper bound of each level, on net_stimulus).
export const STIMULUS_THRESHOLDS = [0.0, 0.3, 0.6, 0.9, 1.3, 1.8, 2.3] as const;
export const MAX_STIMULUS_LEVEL = 7;

/** Map a net stimulus value to a 0–7 heat level. */
export function getStimulusLevel(netStimulus: number): number {
  if (!Number.isFinite(netStimulus)) return 0;
  for (let level = 0; level < STIMULUS_THRESHOLDS.length; level++) {
    if (netStimulus <= STIMULUS_THRESHOLDS[level]) return level;
  }
  return MAX_STIMULUS_LEVEL;
}

/** Convert a per-region net record to per-region 0–7 levels for the body map. */
export function levelsFromNet(net: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [region, value] of Object.entries(net)) {
    out[region] = getStimulusLevel(value);
  }
  return out;
}

/** Net stimulus at which a muscle's dial contribution saturates (stimulusScale.ts). */
export const OPTIMAL_NET = 1.8;

/** How close a muscle is to an optimal weekly dose, 0–1 (stimulusScale.ts). */
export function stimulusAdequacy(netStimulus: number): number {
  if (!Number.isFinite(netStimulus) || netStimulus <= 0) return 0;
  return Math.min(1, netStimulus / OPTIMAL_NET);
}

/**
 * 0–100 stimulus score: mean adequacy across trained muscles. 100 means every
 * trained muscle is at or above productive-growth territory — a strong split
 * honestly lands in the 40–70 range.
 */
export function stimulusScore(net: Record<string, number>): number {
  const values = Object.values(net).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return 0;
  const mean = values.reduce((n, v) => n + stimulusAdequacy(v), 0) / values.length;
  return Math.round(mean * 100);
}

// ── e1RM (Brzycki) ──────────────────────────────────────────────────────────

export function e1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  if (reps >= 36) return weight * 36; // formula degenerates past 36 reps
  return (weight * 36) / (37 - reps);
}
