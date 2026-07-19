import type { ActiveSession, SetRecord } from './AppState';

export type CompletedSetUpdate = Partial<SetRecord>;

export interface CompletedSetEditResult {
  session: ActiveSession;
  exerciseId: string;
  record: SetRecord;
  /** True when this is the row's newest completed set and should refresh its shadow. */
  updatesLastUsed: boolean;
  changed: boolean;
}

const SET_RECORD_FIELDS = new Set<keyof SetRecord>(['weight', 'reps', 'rir']);

function owns(value: object, field: keyof SetRecord): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function validSetRecord(record: SetRecord): boolean {
  return (
    Number.isFinite(record.weight) &&
    record.weight >= 0 &&
    record.weight <= 9_999.99 &&
    Number.isInteger(record.reps) &&
    record.reps >= 1 &&
    record.reps <= 999 &&
    (record.rir === undefined ||
      (Number.isInteger(record.rir) && record.rir >= 0 && record.rir <= 5))
  );
}

function sameSetRecord(left: SetRecord | undefined, right: SetRecord): boolean {
  return (
    left !== undefined &&
    left.weight === right.weight &&
    left.reps === right.reps &&
    left.rir === right.rir
  );
}

/**
 * Replace one already-committed working set without changing workout shape or
 * identity. Invalid IDs, indexes, fields, and API-incompatible values fail
 * closed so a UI draft can never corrupt the resumable session.
 */
export function editCompletedSetInSession(
  session: ActiveSession,
  sessionExerciseId: string,
  setIndex: number,
  update: CompletedSetUpdate
): CompletedSetEditResult | null {
  if (
    typeof sessionExerciseId !== 'string' ||
    sessionExerciseId.length === 0 ||
    !Number.isInteger(setIndex) ||
    setIndex < 0 ||
    update === null ||
    typeof update !== 'object' ||
    Array.isArray(update)
  ) {
    return null;
  }

  const fields = Object.keys(update);
  if (
    fields.length === 0 ||
    fields.some((field) => !SET_RECORD_FIELDS.has(field as keyof SetRecord))
  ) {
    return null;
  }

  const exerciseIndex = session.exercises.findIndex(
    (exercise) => exercise.sessionExerciseId === sessionExerciseId
  );
  const exercise = session.exercises[exerciseIndex];
  const previous = exercise?.completedSets[setIndex];
  if (!exercise || !previous) return null;

  const weight = owns(update, 'weight') ? update.weight : previous.weight;
  const reps = owns(update, 'reps') ? update.reps : previous.reps;
  const rir = owns(update, 'rir') ? update.rir : previous.rir;
  const record: SetRecord = {
    weight: weight as number,
    reps: reps as number,
    ...(rir === undefined ? {} : { rir }),
  };
  if (!validSetRecord(record)) return null;

  const updatesLastUsed = setIndex === exercise.completedSets.length - 1;
  if (sameSetRecord(previous, record)) {
    return {
      session,
      exerciseId: exercise.exercise.id,
      record: previous,
      updatesLastUsed,
      changed: false,
    };
  }

  const completedSets = [...exercise.completedSets];
  completedSets[setIndex] = record;
  const exercises = [...session.exercises];
  exercises[exerciseIndex] = { ...exercise, completedSets };
  return {
    session: { ...session, exercises },
    exerciseId: exercise.exercise.id,
    record,
    updatesLastUsed,
    changed: true,
  };
}

/** Keep the dial prefill shadow in lockstep when the newest set is edited. */
export function lastUsedAfterCompletedSetEdit(
  lastUsed: Record<string, SetRecord>,
  edit: CompletedSetEditResult
): Record<string, SetRecord> {
  if (!edit.updatesLastUsed || sameSetRecord(lastUsed[edit.exerciseId], edit.record)) {
    return lastUsed;
  }
  return { ...lastUsed, [edit.exerciseId]: edit.record };
}
