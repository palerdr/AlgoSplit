import type { Exercise } from '../data/exercises';
import type { SessionExercise, SetRecord } from './AppState';

const MAX_REQUESTED_SETS = 999;

/**
 * Metadata shared by the one-set blocks created from one saved exercise row.
 * `setOrdinal` is one-based so it can be displayed without another offset.
 */
export interface SessionSetBlockMetadata {
  sourceOccurrenceId: string;
  setOrdinal: number;
  setCount: number;
}

export interface SessionSetBlockSeed {
  startedAt: number;
  /** First unused live-session ordinal; one ordinal is consumed per set. */
  firstOrdinal: number;
  exercise: Exercise;
  requestedSets: number;
  warmupEnabled?: boolean;
  notes?: string;
}

export interface AggregatedCompletedExercise {
  name: string;
  sets: number;
  records: SetRecord[];
  notes: string;
}

function normalizedRequestedSets(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_REQUESTED_SETS, Math.max(1, Math.trunc(value)));
}

/**
 * Expand one requested exercise occurrence into independently reorderable,
 * stable one-set rows. Only its first block inherits the pre-workout warmup;
 * the live order can subsequently toggle any individual block.
 */
export function createSessionSetBlocks(seed: SessionSetBlockSeed): SessionExercise[] {
  const setCount = normalizedRequestedSets(seed.requestedSets);
  const sourceOccurrenceId =
    `session-${seed.startedAt}-occurrence-${seed.firstOrdinal}`;

  return Array.from({ length: setCount }, (_, index): SessionExercise => ({
    sessionExerciseId:
      `session-${seed.startedAt}-exercise-${seed.firstOrdinal + index}`,
    sourceOccurrenceId,
    setOrdinal: index + 1,
    setCount,
    exercise: seed.exercise,
    targetSets: 1,
    warmupEnabled: index === 0 && seed.warmupEnabled === true,
    warmupCompleted: false,
    warmupBypassed: false,
    completedSets: [],
    notes: seed.notes ?? '',
  }));
}

function validBlockMetadata(
  exercise: SessionExercise
): exercise is SessionExercise & SessionSetBlockMetadata {
  return (
    typeof exercise.sourceOccurrenceId === 'string' &&
    exercise.sourceOccurrenceId.length > 0 &&
    Number.isInteger(exercise.setOrdinal) &&
    (exercise.setOrdinal ?? 0) >= 1 &&
    Number.isInteger(exercise.setCount) &&
    (exercise.setCount ?? 0) >= (exercise.setOrdinal ?? 0)
  );
}

interface CompletedGroup {
  name: string;
  notes: string;
  latestCompletedAt: number | null;
  members: Array<{
    order: number;
    setOrdinal: number | null;
    lastCompletedAt: number | null;
    records: readonly SetRecord[];
  }>;
}

/**
 * Fold one-set siblings back into the historical/backend exercise shape.
 * The source occurrence is part of the key, so two separately-authored rows
 * for the same catalog exercise remain separate completed exercises.
 */
export function aggregateCompletedSessionExercises(
  exercises: readonly SessionExercise[]
): AggregatedCompletedExercise[] {
  const groups: CompletedGroup[] = [];
  const byKey = new Map<string, CompletedGroup>();

  exercises.forEach((exercise, order) => {
    if (exercise.completedSets.length === 0) return;
    const metadata = validBlockMetadata(exercise) ? exercise : null;
    const key = metadata
      ? JSON.stringify(['occurrence', metadata.sourceOccurrenceId, exercise.exercise.id])
      : JSON.stringify(['legacy-row', exercise.sessionExerciseId]);
    let group = byKey.get(key);
    if (!group) {
      group = {
        name: exercise.exercise.name,
        notes: exercise.notes,
        latestCompletedAt: null,
        members: [],
      };
      byKey.set(key, group);
      groups.push(group);
    } else {
      // Exercise cues are global and normally identical across siblings. If a
      // newer block carries an edit, keep that latest persisted value.
      group.notes = exercise.notes;
    }
    group.members.push({
      order,
      setOrdinal: metadata?.setOrdinal ?? null,
      lastCompletedAt:
        typeof exercise.lastCompletedAt === 'number' &&
        Number.isFinite(exercise.lastCompletedAt)
          ? exercise.lastCompletedAt
          : null,
      records: exercise.completedSets,
    });
    if (
      typeof exercise.lastCompletedAt === 'number' &&
      Number.isFinite(exercise.lastCompletedAt)
    ) {
      group.latestCompletedAt = Math.max(
        group.latestCompletedAt ?? Number.NEGATIVE_INFINITY,
        exercise.lastCompletedAt
      );
    }
  });

  // Keep normal exercise layout stable. Only duplicate-name group slots are
  // ordered by their last accepted set so the final matching history row is
  // also the genuinely latest source for the next-session weight star.
  const orderedGroups = [...groups];
  const positionsByName = new Map<string, number[]>();
  groups.forEach((group, index) => {
    const key = group.name.trim().toLocaleLowerCase();
    positionsByName.set(key, [...(positionsByName.get(key) ?? []), index]);
  });
  positionsByName.forEach((positions) => {
    if (positions.length < 2) return;
    const duplicates = positions
      .map((position) => groups[position])
      .sort((left, right) => {
        if (left.latestCompletedAt === null && right.latestCompletedAt === null) return 0;
        if (left.latestCompletedAt === null) return -1;
        if (right.latestCompletedAt === null) return 1;
        return left.latestCompletedAt - right.latestCompletedAt;
      });
    positions.forEach((position, index) => {
      orderedGroups[position] = duplicates[index];
    });
  });

  return orderedGroups.map((group) => {
    const records = [...group.members]
      .sort((left, right) => {
        if (
          left.lastCompletedAt !== null &&
          right.lastCompletedAt !== null &&
          left.lastCompletedAt !== right.lastCompletedAt
        ) {
          return left.lastCompletedAt - right.lastCompletedAt;
        }
        if (left.setOrdinal === null || right.setOrdinal === null) {
          return left.order - right.order;
        }
        return left.setOrdinal - right.setOrdinal || left.order - right.order;
      })
      .flatMap((member) => member.records);
    return {
      name: group.name,
      sets: records.length,
      records,
      notes: group.notes,
    };
  });
}
