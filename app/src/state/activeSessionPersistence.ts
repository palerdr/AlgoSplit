import type { Exercise, MuscleInvolvement } from '../data/exercises';
import type { ActiveSession, SessionExercise, SetRecord } from './AppState';

type UnknownRecord = Record<string, unknown>;

const STIMULUS_TIERS = new Set(['prime', 'secondary', 'tertiary', 'quaternary']);
const RESISTANCE_PROFILES = new Set(['ascending', 'mid', 'descending']);
// 100 authored exercises at the editor's 20-set limit. Beyond this, preserve
// grouped legacy rows instead of allocating an unbounded migration.
const MAX_RESTORED_SESSION_BLOCKS = 2_000;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown): string | undefined {
  const result = nonEmptyString(value);
  return result ?? undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function restoreSetRecord(value: unknown): SetRecord | null {
  const stored = record(value);
  if (!stored) return null;
  const weight = finiteNumber(stored.weight);
  const reps = finiteNumber(stored.reps);
  const rir = stored.rir === undefined ? undefined : finiteNumber(stored.rir);
  if (
    weight === null || weight < 0 || weight > 9_999.99 ||
    reps === null || !Number.isInteger(reps) || reps < 1 || reps > 999 ||
    (rir !== undefined && (rir === null || !Number.isInteger(rir) || rir < 0 || rir > 5))
  ) return null;
  return { weight, reps, ...(rir === undefined ? {} : { rir }) };
}

function restoreMuscle(value: unknown): MuscleInvolvement | null {
  const stored = record(value);
  if (!stored) return null;
  const region = nonEmptyString(stored.region);
  const weight = finiteNumber(stored.weight);
  const tier = nonEmptyString(stored.tier);
  if (!region || weight === null || weight < 0 || !tier || !STIMULUS_TIERS.has(tier)) {
    return null;
  }
  return {
    region,
    weight: Math.min(1, weight),
    tier: tier as MuscleInvolvement['tier'],
  };
}

function restoreExercise(value: unknown): Exercise | null {
  const stored = record(value);
  if (!stored) return null;
  const id = nonEmptyString(stored.id);
  const name = nonEmptyString(stored.name);
  if (!id || !name) return null;
  const axialLoad = finiteNumber(stored.axialLoad);
  const resistanceProfile = nonEmptyString(stored.resistanceProfile);
  return {
    id,
    name,
    muscles: Array.isArray(stored.muscles)
      ? stored.muscles.map(restoreMuscle).filter((muscle): muscle is MuscleInvolvement => muscle !== null)
      : [],
    axialLoad: axialLoad === null ? 0 : Math.min(1, Math.max(0, axialLoad)),
    resistanceProfile: resistanceProfile && RESISTANCE_PROFILES.has(resistanceProfile)
      ? resistanceProfile as Exercise['resistanceProfile']
      : 'mid',
    unilateral: stored.unilateral === true,
    ...(typeof stored.equipment === 'string' ? { equipment: stored.equipment } : {}),
  };
}

function fallbackSessionExerciseId(startedAt: number, index: number): string {
  return `session-${startedAt}-exercise-${index}`;
}

function restoreSessionExercise(
  value: unknown,
  startedAt: number,
  index: number,
  usedIds: Set<string>
): SessionExercise | null {
  const stored = record(value);
  if (!stored) return null;
  const exercise = restoreExercise(stored.exercise);
  if (!exercise) return null;

  const completedSets = Array.isArray(stored.completedSets)
    ? stored.completedSets
        .map(restoreSetRecord)
        .filter((set): set is SetRecord => set !== null)
    : [];
  const storedTarget = finiteNumber(stored.targetSets);
  const targetSets = Math.max(
    1,
    completedSets.length,
    storedTarget !== null && Number.isInteger(storedTarget)
      ? Math.min(storedTarget, 999)
      : 1
  );

  let sessionExerciseId = nonEmptyString(stored.sessionExerciseId);
  if (!sessionExerciseId || usedIds.has(sessionExerciseId)) {
    sessionExerciseId = fallbackSessionExerciseId(startedAt, index);
    let collision = 1;
    while (usedIds.has(sessionExerciseId)) {
      sessionExerciseId = `${fallbackSessionExerciseId(startedAt, index)}-restored-${collision++}`;
    }
  }
  usedIds.add(sessionExerciseId);

  const sourceOccurrenceId = nonEmptyString(stored.sourceOccurrenceId);
  const storedSetOrdinal = finiteNumber(stored.setOrdinal);
  const storedSetCount = finiteNumber(stored.setCount);
  const hasValidBlockMetadata =
    sourceOccurrenceId !== null &&
    storedSetOrdinal !== null &&
    Number.isInteger(storedSetOrdinal) &&
    storedSetOrdinal >= 1 &&
    storedSetCount !== null &&
    Number.isInteger(storedSetCount) &&
    storedSetCount >= storedSetOrdinal &&
    storedSetCount <= 999;
  const storedLastCompletedAt = finiteNumber(stored.lastCompletedAt);

  return {
    sessionExerciseId,
    ...(hasValidBlockMetadata
      ? {
          sourceOccurrenceId,
          setOrdinal: storedSetOrdinal,
          setCount: storedSetCount,
        }
      : {}),
    exercise,
    targetSets,
    warmupEnabled: stored.warmupEnabled === true,
    warmupCompleted: stored.warmupCompleted === true,
    warmupBypassed: stored.warmupBypassed === true,
    completedSets,
    ...(storedLastCompletedAt !== null && storedLastCompletedAt > 0
      ? { lastCompletedAt: storedLastCompletedAt }
      : {}),
    notes: typeof stored.notes === 'string' ? stored.notes.slice(0, 500) : '',
  };
}

function uniqueMigratedBlockId(
  originalId: string,
  setOrdinal: number,
  usedIds: Set<string>
): string {
  let candidate = `${originalId}-set-${setOrdinal}`;
  let collision = 1;
  while (usedIds.has(candidate)) {
    candidate = `${originalId}-set-${setOrdinal}-restored-${collision++}`;
  }
  usedIds.add(candidate);
  return candidate;
}

/** Upgrade pre-block-schema grouped rows without losing any committed work. */
function migrateGroupedSessionExercise(
  exercise: SessionExercise,
  usedIds: Set<string>,
  availableBlocks: number,
  syntheticCompletionClock: { current: number }
): SessionExercise[] {
  if (exercise.sourceOccurrenceId || exercise.targetSets <= 1) return [exercise];
  if (exercise.targetSets > availableBlocks) return [exercise];

  const setCount = exercise.targetSets;
  const sourceOccurrenceId = `restored-occurrence-${exercise.sessionExerciseId}`;
  return Array.from({ length: setCount }, (_, index): SessionExercise => {
    const completedRecord = exercise.completedSets[index];
    const lastCompletedAt = completedRecord
      ? exercise.lastCompletedAt
        ? Math.max(
            1,
            exercise.lastCompletedAt - (exercise.completedSets.length - 1 - index)
          )
        : syntheticCompletionClock.current++
      : undefined;
    if (lastCompletedAt !== undefined) {
      syntheticCompletionClock.current = Math.max(
        syntheticCompletionClock.current,
        lastCompletedAt + 1
      );
    }
    return {
      sessionExerciseId:
        index === 0
          ? exercise.sessionExerciseId
          : uniqueMigratedBlockId(exercise.sessionExerciseId, index + 1, usedIds),
      sourceOccurrenceId,
      setOrdinal: index + 1,
      setCount,
      exercise: exercise.exercise,
      targetSets: 1,
      warmupEnabled: index === 0 && exercise.warmupEnabled,
      warmupCompleted: index === 0 && exercise.warmupCompleted,
      warmupBypassed: index === 0 && exercise.warmupBypassed,
      completedSets: completedRecord ? [completedRecord] : [],
      ...(lastCompletedAt === undefined ? {} : { lastCompletedAt }),
      notes: exercise.notes,
    };
  });
}

/**
 * Restore an untrusted AsyncStorage snapshot without expiring long-running
 * workouts. Invalid exercises are isolated instead of making the app fail to
 * start, and missing fields from older session schemas receive safe defaults.
 */
export function restoreActiveSession(value: unknown): ActiveSession | null {
  const stored = record(value);
  if (!stored) return null;
  const startedAt = finiteNumber(stored.startedAt);
  if (startedAt === null || startedAt <= 0 || !Array.isArray(stored.exercises)) return null;

  const usedIds = new Set<string>();
  const restoredExercises = stored.exercises
    .slice(0, MAX_RESTORED_SESSION_BLOCKS)
    .map((exercise, index) => restoreSessionExercise(exercise, startedAt, index, usedIds))
    .filter((exercise): exercise is SessionExercise => exercise !== null);
  const currentIndex = finiteNumber(stored.currentIndex);
  const restoredAtEnd =
    currentIndex !== null &&
    Number.isInteger(currentIndex) &&
    currentIndex === restoredExercises.length;
  const restoredCurrentIndex =
    restoredExercises.length === 0
      ? 0
      : Math.min(
          restoredExercises.length - 1,
          Math.max(
            0,
            currentIndex !== null && Number.isInteger(currentIndex) ? currentIndex : 0
          )
        );
  const exercises: SessionExercise[] = [];
  let migratedCurrentIndex = 0;
  const syntheticCompletionClock = { current: startedAt };
  restoredExercises.forEach((exercise, index) => {
    const startIndex = exercises.length;
    const blocks = migrateGroupedSessionExercise(
      exercise,
      usedIds,
      Math.max(0, MAX_RESTORED_SESSION_BLOCKS - exercises.length),
      syntheticCompletionClock
    );
    exercises.push(...blocks);
    if (index !== restoredCurrentIndex) return;
    const pendingOffset =
      exercise.warmupEnabled && !exercise.warmupCompleted && !exercise.warmupBypassed
        ? 0
        : Math.min(exercise.completedSets.length, blocks.length - 1);
    migratedCurrentIndex = startIndex + pendingOffset;
  });

  return {
    name: nonEmptyString(stored.name) ?? 'Workout',
    planned: stored.planned === true,
    exercises,
    currentIndex:
      exercises.length === 0 ? 0 : restoredAtEnd ? exercises.length : migratedCurrentIndex,
    startedAt,
    edited: stored.edited === true,
    ...(optionalString(stored.splitId) ? { splitId: optionalString(stored.splitId) } : {}),
    ...(optionalString(stored.sessionId) ? { sessionId: optionalString(stored.sessionId) } : {}),
  };
}

/** Continue stable live-row IDs without colliding after a restored edit/add. */
export function nextSessionExerciseOrdinal(session: ActiveSession): number {
  const prefix = `session-${session.startedAt}-exercise-`;
  let next = session.exercises.length;
  for (const exercise of session.exercises) {
    if (!exercise.sessionExerciseId.startsWith(prefix)) continue;
    const ordinal = Number(exercise.sessionExerciseId.slice(prefix.length).split('-')[0]);
    if (Number.isInteger(ordinal) && ordinal >= 0) next = Math.max(next, ordinal + 1);
  }
  return next;
}
