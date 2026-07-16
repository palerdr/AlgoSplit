import type { ExerciseResponse, SplitResponse } from '../api/backend';
import { EXERCISES, type Exercise } from '../data/exercises';

export interface PlannedExercise {
  exercise: Exercise;
  sets: number;
}

export interface AccountWorkoutPlan {
  kind: 'workout';
  id: string;
  splitId: string;
  splitName: string;
  sessionId: string;
  name: string;
  dayNumber: number;
  exercises: PlannedExercise[];
}

export interface AccountRestSentinel {
  kind: 'rest';
  id: string;
  splitId: string;
  splitName: string;
  /** Null only for an automatic interior-gap sentinel that is not persisted. */
  sessionId: string | null;
  name: string;
  dayNumber: number;
  exercises: [];
  synthetic: boolean;
}

export type AccountWorkoutEditorEntry = AccountWorkoutPlan | AccountRestSentinel;

export interface AccountWorkoutGroup {
  id: string;
  name: string;
  cycleLength: number | null;
  sessions: AccountWorkoutPlan[];
}

export interface AccountWorkoutEditorGroup {
  id: string;
  name: string;
  cycleLength: number | null;
  sessions: AccountWorkoutEditorEntry[];
}

function normalizeExerciseName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}

const EXERCISES_BY_NAME = new Map<string, Exercise>();
for (const exercise of EXERCISES) {
  EXERCISES_BY_NAME.set(normalizeExerciseName(exercise.name), exercise);
  EXERCISES_BY_NAME.set(normalizeExerciseName(exercise.id), exercise);
}

function resistanceProfile(
  value: string | null
): Exercise['resistanceProfile'] {
  return value === 'ascending' || value === 'descending' || value === 'mid'
    ? value
    : 'mid';
}

/** Resolve a persisted split exercise without dropping custom/unknown names. */
export function resolveSavedExercise(saved: ExerciseResponse): Exercise {
  const catalog = EXERCISES_BY_NAME.get(normalizeExerciseName(saved.exercise_name));
  if (catalog) {
    return {
      ...catalog,
      unilateral: saved.unilateral,
      resistanceProfile: resistanceProfile(saved.resistance_profile),
    };
  }

  return {
    id: `account:${saved.id}`,
    name: saved.exercise_name,
    muscles: [],
    axialLoad: 0,
    resistanceProfile: resistanceProfile(saved.resistance_profile),
    unilateral: saved.unilateral,
  };
}

function persistedEntries(split: SplitResponse): AccountWorkoutEditorEntry[] {
  return [...split.sessions]
    .sort((left, right) => left.day_number - right.day_number)
    .map((session) => {
      if (session.exercises.length === 0) {
        return {
          kind: 'rest' as const,
          id: `${split.id}:${session.id}`,
          splitId: split.id,
          splitName: split.name,
          sessionId: session.id,
          name: session.name || 'Rest',
          dayNumber: session.day_number,
          exercises: [] as [],
          synthetic: false,
        };
      }
      return {
        kind: 'workout' as const,
        id: `${split.id}:${session.id}`,
        splitId: split.id,
        splitName: split.name,
        sessionId: session.id,
        name: session.name,
        dayNumber: session.day_number,
        exercises: [...session.exercises]
          .sort((left, right) => left.order_index - right.order_index)
          .map((saved) => ({
            exercise: resolveSavedExercise(saved),
            sets: Math.max(1, saved.sets),
          })),
      };
    });
}

function splitPlans(split: SplitResponse): AccountWorkoutPlan[] {
  return persistedEntries(split).filter(
    (entry): entry is AccountWorkoutPlan => entry.kind === 'workout'
  );
}

function splitEditorEntries(split: SplitResponse): AccountWorkoutEditorEntry[] {
  const entries = persistedEntries(split);
  if (entries.length < 2) return entries;

  const occupied = new Set(entries.map((entry) => entry.dayNumber));
  const firstDay = Math.min(...occupied);
  const lastDay = Math.max(...occupied);
  for (let dayNumber = firstDay + 1; dayNumber < lastDay; dayNumber += 1) {
    if (occupied.has(dayNumber)) continue;
    entries.push({
      kind: 'rest',
      id: `${split.id}:auto-rest:${dayNumber}`,
      splitId: split.id,
      splitName: split.name,
      sessionId: null,
      name: 'Rest',
      dayNumber,
      exercises: [],
      synthetic: true,
    });
  }
  return entries.sort((left, right) => left.dayNumber - right.dayNumber);
}

/** Preserve the saved split hierarchy for split-first workout selection. */
export function accountWorkoutGroups(
  splits: readonly SplitResponse[]
): AccountWorkoutGroup[] {
  return splits.map((split) => ({
    id: split.id,
    name: split.name,
    cycleLength: split.cycle_length,
    sessions: splitPlans(split),
  }));
}

/** Include manual and interior-gap rest sentinels for schedule editing only. */
export function accountWorkoutEditorGroups(
  splits: readonly SplitResponse[]
): AccountWorkoutEditorGroup[] {
  return splits.map((split) => ({
    id: split.id,
    name: split.name,
    cycleLength: split.cycle_length,
    sessions: splitEditorEntries(split),
  }));
}

/** Flat form retained for calculations and callers that do not render hierarchy. */
export function accountWorkoutPlans(splits: readonly SplitResponse[]): AccountWorkoutPlan[] {
  return accountWorkoutGroups(splits).flatMap((group) => group.sessions);
}
