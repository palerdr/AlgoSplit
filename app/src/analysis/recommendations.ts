/**
 * Recommendation engine — derived from the stimulus engine, not from thresholds.
 *
 * Every candidate change is scored by *re-running* the same steady-state
 * simulation the analysis tab displays, so a move's value is the real change in
 * the 0–100 stimulus score rather than a rule about set counts. Moves are then
 * ranked by marginal score per unit of added fatigue, which is why the top
 * suggestion is often to *remove* volume: sets on an already-saturated muscle
 * score nothing themselves while taxing every later set through CNS fatigue.
 *
 * Fatigue is priced from the same modifiers the engine already models — axial
 * load (CNS set-equivalents) and each worked region's damage tier and recovery
 * modifier — so the denominator is not a second, invented model.
 *
 * v1 only considers moves on exercises already in the split (trim a set, add a
 * set, correct a resistance profile). Adding new movements is deliberately out
 * of scope: the score is a flat mean over trained muscles, so introducing a
 * region at one set lands it in the denominator at near-zero adequacy and reads
 * as a regression until several sets accumulate.
 */

import {
  AXIAL_CNS_EQUIV_SETS,
  AXIAL_SET_CONTRIBUTION,
  MAX_CYCLE_DAYS,
  ScheduledSession,
  analyzeSchedule,
  stimulusAdequacy,
} from './stimulus';
import { Exercise, getExerciseByName } from '../data/exercises';
import { MUSCLE_REGIONS } from '../data/muscleRegions.gen';

export type ResistanceProfile = Exercise['resistanceProfile'];

const PROFILES: ResistanceProfile[] = ['ascending', 'mid', 'descending'];

export const PROFILE_LABEL: Record<ResistanceProfile, string> = {
  ascending: 'Ascending',
  mid: 'Mid-range',
  descending: 'Descending',
};

const DAYS_PER_WEEK = 7;
const MAX_SETS_PER_EXERCISE = 20;

// ── Fatigue pricing ─────────────────────────────────────────────────────────

/** Relative recovery cost of a set by the region's damage tier. */
export const DAMAGE_TIER_WEIGHT: Record<string, number> = {
  '+': 1.25,
  '0': 1.0,
  '-': 0.85,
};

/** Floor so a movement with sparse involvement data still prices above zero. */
const MIN_DAMAGE_WEIGHT = 0.4;

/**
 * Fatigue cost of ONE set of an exercise, in set-equivalents: the systemic CNS
 * charge (1 set + its axial surcharge) scaled by how expensive the worked
 * tissue is to recover. A heavy squat prices far above a cable pushdown.
 */
export function setFatigueLoad(exercise: Exercise): number {
  const axial = 1 + AXIAL_CNS_EQUIV_SETS * AXIAL_SET_CONTRIBUTION * exercise.axialLoad;
  const damage = exercise.muscles.reduce((total, muscle) => {
    const meta = MUSCLE_REGIONS[muscle.region];
    const tier = DAMAGE_TIER_WEIGHT[meta?.damageTier ?? '0'] ?? 1;
    return total + muscle.weight * tier * (meta?.recoveryModifier ?? 1);
  }, 0);
  return axial * Math.max(MIN_DAMAGE_WEIGHT, damage);
}

// ── Schedule model ──────────────────────────────────────────────────────────

export interface ScheduleExercise {
  /** Stable within one schedule; used to key moves back to a row. */
  key: string;
  name: string;
  sets: number;
  /** Catalog exercise with this row's profile/unilateral overrides applied. */
  exercise: Exercise;
}

export interface ScheduleSession {
  name: string;
  day: number;
  exercises: ScheduleExercise[];
}

export interface Schedule {
  cycleLength: number;
  sessions: ScheduleSession[];
  /** Exercise names no catalog entry matched; excluded from the simulation. */
  unresolved: string[];
}

/** Structural input so the analysis layer stays free of API types. */
export interface ScheduleSourceExercise {
  name: string;
  sets: number;
  unilateral?: boolean | null;
  resistanceProfile?: string | null;
}

export interface ScheduleSourceSession {
  name: string;
  day: number;
  exercises: readonly ScheduleSourceExercise[];
}

export interface ScheduleSource {
  cycleLength?: number | null;
  sessions: readonly ScheduleSourceSession[];
}

function asProfile(value: string | null | undefined): ResistanceProfile | null {
  return value === 'ascending' || value === 'mid' || value === 'descending' ? value : null;
}

/**
 * Resolve saved rows against the catalog, applying each row's stored overrides
 * on top of its movement pattern's defaults. A null stored profile means "no
 * override" and keeps the pattern's own profile.
 */
export function buildSchedule(source: ScheduleSource): Schedule {
  const unresolved: string[] = [];
  const sessions: ScheduleSession[] = [];

  source.sessions.forEach((session, sessionIndex) => {
    const exercises: ScheduleExercise[] = [];
    session.exercises.forEach((row, rowIndex) => {
      const base = getExerciseByName(row.name);
      if (!base) {
        unresolved.push(row.name);
        return;
      }
      const profile = asProfile(row.resistanceProfile);
      exercises.push({
        key: `${sessionIndex}:${rowIndex}`,
        name: row.name,
        sets: Math.max(0, Math.round(row.sets)),
        exercise: {
          ...base,
          resistanceProfile: profile ?? base.resistanceProfile,
          unilateral: row.unilateral ?? base.unilateral,
        },
      });
    });
    if (exercises.length > 0) {
      sessions.push({ name: session.name, day: session.day, exercises });
    }
  });

  const maxDay = sessions.reduce((day, session) => Math.max(day, session.day), 1);
  return {
    // Clamped to the same ceiling analyzeSchedule simulates, so the weekly
    // frequency the fatigue cost assumes matches the horizon actually run.
    cycleLength: Math.min(
      MAX_CYCLE_DAYS,
      Math.max(source.cycleLength || DAYS_PER_WEEK, maxDay)
    ),
    sessions,
    unresolved,
  };
}

// ── Candidate evaluation ────────────────────────────────────────────────────

/**
 * A change applied to every occurrence of one movement in the split.
 *
 * Splits repeat movements across days — a full-body week runs the same bench
 * press three times. Patching a single day produces three near-identical
 * suggestions, each a third the size, and the real effect of a change (notably
 * trimming a saturated muscle, whose value comes from the CNS tax it lifts off
 * every later set) disappears below the noise floor. Moves therefore address
 * the movement wherever it appears.
 */
interface Patch {
  /** "sessionIndex:exerciseIndex" for every row the move rewrites. */
  targets: Set<string>;
  setsDelta?: number;
  profile?: ResistanceProfile;
}

function scheduleEntries(schedule: Schedule, patch?: Patch): ScheduledSession[] {
  return schedule.sessions.map((session, sessionIndex) => ({
    day: session.day,
    entries: session.exercises
      .map((row, exerciseIndex) => {
        if (!patch || !patch.targets.has(`${sessionIndex}:${exerciseIndex}`)) {
          return { exercise: row.exercise, sets: row.sets };
        }
        return {
          exercise: patch.profile
            ? { ...row.exercise, resistanceProfile: patch.profile }
            : row.exercise,
          sets: row.sets + (patch.setsDelta ?? 0),
        };
      })
      .filter((entry) => entry.sets > 0),
  }));
}

/** Rows sharing a movement, in split order. */
interface MovementGroup {
  name: string;
  targets: Set<string>;
  rows: { session: ScheduleSession; row: ScheduleExercise }[];
}

function movementGroups(schedule: Schedule): MovementGroup[] {
  const groups = new Map<string, MovementGroup>();
  schedule.sessions.forEach((session, sessionIndex) => {
    session.exercises.forEach((row, exerciseIndex) => {
      const key = row.name.toLocaleLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { name: row.name, targets: new Set(), rows: [] };
        groups.set(key, group);
      }
      group.targets.add(`${sessionIndex}:${exerciseIndex}`);
      group.rows.push({ session, row });
    });
  });
  return [...groups.values()];
}

export type MoveKind = 'trim' | 'add' | 'profile';

export interface Move {
  id: string;
  kind: MoveKind;
  /** Imperative label, e.g. "Cut 1 set" or "Ascending profile". */
  action: string;
  exerciseName: string;
  /** The session name when the movement runs once, else "N days". */
  sessionName: string;
  /** How many sessions the move rewrites. */
  occurrences: number;
  /** Change in the 0–100 score, unrounded. */
  deltaScore: number;
  /** Signed weekly fatigue in set-equivalents; negative means fatigue freed. */
  deltaFatigue: number;
  /** Score gained per unit of added fatigue; Infinity when the move is free. */
  efficiency: number;
  /** Per-region net change, for previewing the move on the muscle chart. */
  deltaNet: Record<string, number>;
  /** Display names of the regions this move moves most, best first. */
  drivers: string[];
}

/** Below this the change is display noise on a score rendered as an integer. */
const MIN_DELTA_SCORE = 0.25;

/**
 * Score a candidate over a FIXED set of muscles.
 *
 * The displayed score averages adequacy across muscles with positive net, so a
 * change can "win" by pushing an under-trained muscle below zero and out of the
 * denominator rather than by training anything better. On a full-body split,
 * cutting a set of curls measures +3.2 that way — biceps stay saturated while
 * brachialis silently stops counting. Ranking holds the muscle set constant
 * (every region the split trains at all, which is how the backend's score keeps
 * trained-but-negative muscles in), so a move can only gain by raising real
 * stimulus. Every v1 move edits sets or profiles on movements already present,
 * so the trained set never varies between candidates.
 */
function rankingScore(net: Record<string, number>, regions: readonly string[]): number {
  if (regions.length === 0) return 0;
  const total = regions.reduce(
    (sum, region) => sum + stimulusAdequacy(net[region] ?? 0),
    0
  );
  return (total / regions.length) * 100;
}

function driversOf(deltaNet: Record<string, number>): string[] {
  return Object.entries(deltaNet)
    .filter(([, value]) => value > 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([region]) => MUSCLE_REGIONS[region]?.displayName ?? region);
}

function diffNet(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const region of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const value = (after[region] ?? 0) - (before[region] ?? 0);
    if (Math.abs(value) > 1e-6) delta[region] = value;
  }
  return delta;
}

export interface Recommendation {
  /**
   * Local-engine reference the deltas are measured from. It is not the number
   * the analysis tab shows — that comes from the backend engine, which models
   * more than this port — so surface `deltaScore` against the displayed score
   * rather than showing this directly.
   */
  baselineScore: number;
  baselineNet: Record<string, number>;
  moves: Move[];
  unresolved: string[];
}

/**
 * Rank every single-row change to the split by marginal score per unit fatigue.
 *
 * Free wins first — a move that adds score while removing fatigue strictly
 * dominates one that buys the same score with more work — then the rest by
 * efficiency.
 */
export function recommendMoves(schedule: Schedule, limit = 4): Recommendation {
  const baselineNet = analyzeSchedule(scheduleEntries(schedule), schedule.cycleLength);
  // Every region the split trains at all — the fixed denominator for ranking.
  const regions = Object.keys(baselineNet);
  const baselineScore = rankingScore(baselineNet, regions);
  const sessionsPerWeek = DAYS_PER_WEEK / Math.max(1, schedule.cycleLength);
  const moves: Move[] = [];

  const evaluate = (
    group: MovementGroup,
    patch: Patch,
    kind: MoveKind,
    action: string,
    deltaFatigue: number
  ): void => {
    const net = analyzeSchedule(scheduleEntries(schedule, patch), schedule.cycleLength);
    const deltaScore = rankingScore(net, regions) - baselineScore;
    if (deltaScore < MIN_DELTA_SCORE) return;
    const deltaNet = diffNet(baselineNet, net);
    const occurrences = group.rows.length;
    moves.push({
      id: `${kind}:${group.name.toLocaleLowerCase()}:${action}`,
      kind,
      action,
      exerciseName: group.name,
      sessionName:
        occurrences === 1 ? group.rows[0].session.name : `${occurrences} days`,
      occurrences,
      deltaScore,
      deltaFatigue,
      efficiency: deltaFatigue > 0 ? deltaScore / deltaFatigue : Infinity,
      deltaNet,
      drivers: driversOf(deltaNet),
    });
  };

  for (const group of movementGroups(schedule)) {
    // One set of this movement everywhere it appears, per week.
    const perSet = group.rows.reduce(
      (total, { row }) => total + setFatigueLoad(row.exercise) * sessionsPerWeek,
      0
    );

    if (group.rows.every(({ row }) => row.sets > 1)) {
      evaluate(group, { targets: group.targets, setsDelta: -1 }, 'trim', 'Cut 1 set', -perSet);
    }
    if (group.rows.every(({ row }) => row.sets < MAX_SETS_PER_EXERCISE)) {
      evaluate(group, { targets: group.targets, setsDelta: 1 }, 'add', 'Add 1 set', perSet);
    }
    for (const profile of PROFILES) {
      if (group.rows.every(({ row }) => row.exercise.resistanceProfile === profile)) continue;
      // Re-rating the resistance curve changes which muscles the leverage model
      // credits — it costs nothing, so it is priced at zero fatigue.
      evaluate(
        group,
        { targets: group.targets, profile },
        'profile',
        `${PROFILE_LABEL[profile]} profile`,
        0
      );
    }
  }

  moves.sort((a, b) => {
    const aFree = a.deltaFatigue <= 0;
    const bFree = b.deltaFatigue <= 0;
    if (aFree !== bFree) return aFree ? -1 : 1;
    if (aFree) return b.deltaScore - a.deltaScore;
    return b.efficiency - a.efficiency;
  });

  // One suggestion per movement — a list offering both "ascending" and
  // "descending" for the same bench press is noise, and the best-ranked
  // variant already represents that movement's opportunity.
  const claimed = new Set<string>();
  const best = moves.filter((move) => {
    const key = move.exerciseName.toLocaleLowerCase();
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });

  const ranked = best.slice(0, limit);

  // Free corrections otherwise fill every slot, and the score-per-fatigue
  // ranking — which only separates moves that *cost* fatigue — never shows.
  // Reserve the last slot for the most efficient costed move so the trade-off
  // is always on screen.
  if (limit > 1 && ranked.every((move) => move.deltaFatigue <= 0)) {
    const costed = best.find((move) => move.deltaFatigue > 0);
    if (costed) {
      if (ranked.length === limit) ranked[limit - 1] = costed;
      else ranked.push(costed);
    }
  }

  return {
    baselineScore,
    baselineNet,
    moves: ranked,
    unresolved: schedule.unresolved,
  };
}

/** Convenience: source → schedule → ranked moves. */
export function recommendForSource(source: ScheduleSource, limit = 4): Recommendation {
  return recommendMoves(buildSchedule(source), limit);
}
