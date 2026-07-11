import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutExerciseCreate } from '../types/api.types';
import { normalizeExerciseIdentity } from '../utils/exerciseIdentity';

export interface SetData {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
}

export interface PreviousExerciseData {
  reps: number[];
  weight: number[];
  rir?: (number | null)[];
  notes?: string | null;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: SetData[];
  notes: string;
  unilateral?: boolean;
  templateExerciseId?: string;
}

interface ActiveWorkout {
  sessionName: string;
  startedAt: string;
  workoutDate?: string;
  exercises: WorkoutExercise[];
  sessionId?: string;
  splitId?: string;
  previousData?: Record<string, PreviousExerciseData>;
}

interface RestTimerState {
  isRunning: boolean;
  duration: number;
  remaining: number;
  startedAt: string | null;
  exerciseId: string | null;
}

import { useSettingsStore } from './settingsStore';

function getRestDuration(): number {
  return useSettingsStore.getState().restDuration;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function toWorkoutCompletionIso(workoutDate?: string): string | undefined {
  if (!workoutDate) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workoutDate)) return undefined;

  // The backend and calendar both derive a workout's date from the first 10
  // chars of completed_at, so we serialize so that slice always equals the
  // user's chosen local date. Building a local Date and calling toISOString()
  // would shift the date across the UTC boundary (e.g. April 15 20:00 in
  // UTC-5 → "2026-04-16T01:00:00Z" → wrong day on timeline + stimulus).
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${workoutDate}T${hh}:${mm}:${ss}.${ms}Z`;
}

function buildSharedExerciseNotesKey(
  splitId?: string,
  exerciseName?: string,
): string | null {
  if (!splitId || !exerciseName) return null;
  return `${splitId}:${normalizeExerciseIdentity(exerciseName)}`;
}

/** Key schema used by the previous release; retained for lazy migration. */
function buildSessionExerciseNotesKey(
  splitId?: string,
  sessionName?: string,
  exerciseName?: string,
): string | null {
  if (!splitId || !sessionName || !exerciseName) return null;
  return `${splitId}:${sessionName}:${exerciseName}`;
}

/**
 * Legacy key schema used before commit 457b10e renamed the format to
 * splitId:sessionName:exerciseName. Notes saved under the old IDs-based key
 * were orphaned by that change. We still read this format as a fallback on
 * session start and migrate hits forward to the new key on the same write.
 */
function buildLegacyExerciseNotesKey(
  splitId?: string,
  sessionId?: string,
  templateExerciseId?: string,
): string | null {
  if (!splitId || !sessionId || !templateExerciseId) return null;
  return `${splitId}:${sessionId}:${templateExerciseId}`;
}

export function getPreviousExerciseData(
  previousData: ActiveWorkout['previousData'],
  exerciseName: string,
): PreviousExerciseData | undefined {
  // Raw-name lookup keeps an in-progress workout persisted by the previous
  // app version functional after upgrading to normalized history keys.
  return previousData?.[normalizeExerciseIdentity(exerciseName)] ?? previousData?.[exerciseName];
}

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;
  selectedWorkoutDate: string | null;
  currentExerciseIndex: number;
  exerciseNotesByKey: Record<string, string>;
  restTimer: RestTimerState;

  setCurrentExerciseIndex: (index: number) => void;
  setSelectedWorkoutDate: (date: string | null) => void;
  startWorkout: (sessionName: string) => void;
  startWorkoutFromSession: (
    sessionName: string,
    exercises: Array<{ name: string; sets: number; unilateral: boolean; templateExerciseId?: string }>,
    previousData?: ActiveWorkout['previousData'],
    sessionId?: string,
    splitId?: string,
  ) => void;
  cancelWorkout: () => void;
  addExercise: (name: string, opts?: { unilateral?: boolean }) => void;
  insertExercise: (name: string, afterIndex: number, opts?: { unilateral?: boolean }) => void;
  removeExercise: (exerciseId: string) => void;
  addSet: (exerciseId: string) => void;
  removeSet: (exerciseId: string, setIndex: number) => void;
  updateSet: (exerciseId: string, setIndex: number, data: Partial<SetData>) => void;
  completeSet: (exerciseId: string, setIndex: number) => void;
  updateExerciseNotes: (exerciseId: string, notes: string) => void;
  applyPreviousWorkoutData: (previousData: ActiveWorkout['previousData']) => void;
  resetExerciseProgress: (exerciseId: string) => void;
  renameExercise: (exerciseId: string, newName: string) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;

  startRestTimer: (duration?: number, exerciseId?: string) => void;
  stopRestTimer: () => void;
  tickRestTimer: () => void;

  getWorkoutData: () => {
    sessionName: string;
    completedAt?: string;
    exercises: WorkoutExerciseCreate[];
    durationMinutes?: number;
    sessionId?: string;
    splitId?: string;
  } | null;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      activeWorkout: null,
      selectedWorkoutDate: null,
      currentExerciseIndex: 0,
      exerciseNotesByKey: {},
      restTimer: { isRunning: false, duration: getRestDuration(), remaining: 0, startedAt: null, exerciseId: null },

      setCurrentExerciseIndex: (index) => {
        set({ currentExerciseIndex: index });
      },

      setSelectedWorkoutDate: (date) => {
        set({ selectedWorkoutDate: date });
      },

      startWorkout: (sessionName) => {
        const { selectedWorkoutDate } = get();
        set({
          currentExerciseIndex: 0,
          activeWorkout: {
            sessionName,
            startedAt: new Date().toISOString(),
            workoutDate: selectedWorkoutDate ?? undefined,
            exercises: [],
          },
        });
      },

      startWorkoutFromSession: (sessionName, exercises, previousData, sessionId, splitId) => {
        const { selectedWorkoutDate, exerciseNotesByKey } = get();
        set({ currentExerciseIndex: 0 });
        // Notes now follow an exercise through every day in the split. Read
        // older session- and UUID-keyed values once, then migrate them to the
        // stable split + normalized-exercise identity.
        //
        // Caveat: Supabase regenerates session/exercise row UUIDs on every
        // split edit. This means legacy keys (splitId:sessionId:templateExerciseId)
        // only match for users who never edited their split before 457b10e
        // shipped. For everyone else the legacy keys are unrecoverable — the
        // current row IDs don't match what was used to save. Partial recovery
        // is still better than none, and the cost is one dictionary lookup.
        const noteBackfills: Record<string, string> = {};
        const workoutExercises: WorkoutExercise[] = exercises.map((ex) => {
          const newKey = buildSharedExerciseNotesKey(splitId, ex.name);
          let persistedNotes = newKey ? (exerciseNotesByKey[newKey] ?? '') : '';
          if (!persistedNotes) {
            const sessionKey = buildSessionExerciseNotesKey(splitId, sessionName, ex.name);
            const sessionNotes = sessionKey ? exerciseNotesByKey[sessionKey] : undefined;
            if (sessionNotes) {
              persistedNotes = sessionNotes;
              if (newKey) noteBackfills[newKey] = sessionNotes;
            }
          }
          if (!persistedNotes) {
            const legacyKey = buildLegacyExerciseNotesKey(splitId, sessionId, ex.templateExerciseId);
            const legacyNotes = legacyKey ? exerciseNotesByKey[legacyKey] : undefined;
            if (legacyNotes) {
              persistedNotes = legacyNotes;
              if (newKey) noteBackfills[newKey] = legacyNotes;
            }
          }
          if (!persistedNotes) {
            const previousNotes = getPreviousExerciseData(previousData, ex.name)?.notes?.trim();
            if (previousNotes) {
              persistedNotes = previousNotes;
              if (newKey) noteBackfills[newKey] = previousNotes;
            }
          }
          let sets: SetData[];
          if (ex.unilateral) {
            sets = [];
            for (let i = 0; i < ex.sets; i++) {
              sets.push({ reps: 0, weight: 0, completed: false });
              sets.push({ reps: 0, weight: 0, completed: false });
            }
          } else {
            sets = Array.from({ length: ex.sets }, () => ({ reps: 0, weight: 0, completed: false }));
          }
          return {
            id: generateId(),
            name: ex.name,
            sets,
            notes: persistedNotes,
            unilateral: ex.unilateral || undefined,
            templateExerciseId: ex.templateExerciseId,
          };
        });
        // Functional setter: read-modify-write on exerciseNotesByKey could
        // race a concurrent updateExerciseNotes call during the brief window
        // between snapshot and commit. Merge on top of the latest state.
        set((prev) => ({
          activeWorkout: {
            sessionName,
            startedAt: new Date().toISOString(),
            workoutDate: selectedWorkoutDate ?? undefined,
            exercises: workoutExercises,
            sessionId,
            splitId,
            previousData,
          },
          exerciseNotesByKey: { ...prev.exerciseNotesByKey, ...noteBackfills },
        }));
      },

      cancelWorkout: () => {
        set({
          activeWorkout: null,
          currentExerciseIndex: 0,
          restTimer: { isRunning: false, duration: getRestDuration(), remaining: 0, startedAt: null, exerciseId: null },
        });
      },

      addExercise: (name, opts) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        const isUni = opts?.unilateral ?? false;
        const initialSets: SetData[] = isUni
          ? [{ reps: 0, weight: 0, completed: false }, { reps: 0, weight: 0, completed: false }]
          : [{ reps: 0, weight: 0, completed: false }];
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: [...activeWorkout.exercises, { id: generateId(), name, sets: initialSets, notes: '', unilateral: isUni || undefined }],
          },
        });
      },

      insertExercise: (name, afterIndex, opts) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        const isUni = opts?.unilateral ?? false;
        const initialSets: SetData[] = isUni
          ? [{ reps: 0, weight: 0, completed: false }, { reps: 0, weight: 0, completed: false }]
          : [{ reps: 0, weight: 0, completed: false }];
        const newExercise: WorkoutExercise = { id: generateId(), name, sets: initialSets, notes: '', unilateral: isUni || undefined };
        const exercises = [...activeWorkout.exercises];
        exercises.splice(afterIndex + 1, 0, newExercise);
        set({ activeWorkout: { ...activeWorkout, exercises } });
      },

      removeExercise: (exerciseId) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({ activeWorkout: { ...activeWorkout, exercises: activeWorkout.exercises.filter((e) => e.id !== exerciseId) } });
      },

      addSet: (exerciseId) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;
              if (ex.unilateral) {
                const lastL = ex.sets[ex.sets.length - 2];
                const lastR = ex.sets[ex.sets.length - 1];
                return {
                  ...ex,
                  sets: [
                    ...ex.sets,
                    lastL ? { ...lastL, completed: false } : { reps: 0, weight: 0, completed: false },
                    lastR ? { ...lastR, completed: false } : { reps: 0, weight: 0, completed: false },
                  ],
                };
              }
              const last = ex.sets[ex.sets.length - 1];
              return { ...ex, sets: [...ex.sets, last ? { ...last, completed: false } : { reps: 0, weight: 0, completed: false }] };
            }),
          },
        });
      },

      removeSet: (exerciseId, setIndex) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;
              if (ex.unilateral) {
                if (ex.sets.length <= 2) return ex;
                const pairStart = setIndex % 2 === 0 ? setIndex : setIndex - 1;
                return { ...ex, sets: ex.sets.filter((_, i) => i !== pairStart && i !== pairStart + 1) };
              }
              if (ex.sets.length <= 1) return ex;
              return { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) };
            }),
          },
        });
      },

      updateSet: (exerciseId, setIndex, data) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;
              return { ...ex, sets: ex.sets.map((s, i) => (i === setIndex ? { ...s, ...data } : s)) };
            }),
          },
        });
      },

      completeSet: (exerciseId, setIndex) => {
        const { activeWorkout, startRestTimer, stopRestTimer } = get();
        if (!activeWorkout) return;
        const exercise = activeWorkout.exercises.find((e) => e.id === exerciseId);
        const wasCompleted = exercise?.sets[setIndex]?.completed ?? false;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;
              return { ...ex, sets: ex.sets.map((s, i) => (i === setIndex ? { ...s, completed: !wasCompleted } : s)) };
            }),
          },
        });
        if (!wasCompleted) startRestTimer(getRestDuration(), exerciseId);
        else stopRestTimer();
      },

      updateExerciseNotes: (exerciseId, notes) => {
        const { activeWorkout, exerciseNotesByKey } = get();
        if (!activeWorkout) return;
        const exercise = activeWorkout.exercises.find((ex) => ex.id === exerciseId);
        const noteKey = buildSharedExerciseNotesKey(
          activeWorkout.splitId,
          exercise?.name,
        );
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => (ex.id === exerciseId ? { ...ex, notes } : ex)),
          },
          exerciseNotesByKey: noteKey
            ? { ...exerciseNotesByKey, [noteKey]: notes }
            : exerciseNotesByKey,
        });
      },

      applyPreviousWorkoutData: (previousData) => {
        if (!previousData) return;
        set((prev) => {
          if (!prev.activeWorkout) return prev;

          const noteBackfills: Record<string, string> = {};
          const exercises = prev.activeWorkout.exercises.map((ex) => {
            if (ex.notes.trim()) return ex;

            const previousNotes = getPreviousExerciseData(previousData, ex.name)?.notes?.trim();
            if (!previousNotes) return ex;

            const noteKey = buildSharedExerciseNotesKey(
              prev.activeWorkout?.splitId,
              ex.name,
            );
            if (noteKey) noteBackfills[noteKey] = previousNotes;
            return { ...ex, notes: previousNotes };
          });

          return {
            activeWorkout: {
              ...prev.activeWorkout,
              exercises,
              previousData,
            },
            exerciseNotesByKey: { ...prev.exerciseNotesByKey, ...noteBackfills },
          };
        });
      },

      resetExerciseProgress: (exerciseId) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;
              return { ...ex, sets: ex.sets.map(() => ({ reps: 0, weight: 0, completed: false })) };
            }),
          },
        });
      },

      renameExercise: (exerciseId, newName) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => (ex.id === exerciseId ? { ...ex, name: newName } : ex)),
          },
        });
      },

      reorderExercises: (fromIndex, toIndex) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        const exercises = [...activeWorkout.exercises];
        const [removed] = exercises.splice(fromIndex, 1);
        exercises.splice(toIndex, 0, removed);
        set({ activeWorkout: { ...activeWorkout, exercises } });
      },

      startRestTimer: (duration, exerciseId) => {
        const d = duration ?? getRestDuration();
        set({ restTimer: { isRunning: true, duration: d, remaining: d, startedAt: new Date().toISOString(), exerciseId: exerciseId ?? null } });
      },

      stopRestTimer: () => {
        set({ restTimer: { isRunning: false, duration: getRestDuration(), remaining: 0, startedAt: null, exerciseId: null } });
      },

      tickRestTimer: () => {
        const { restTimer } = get();
        if (!restTimer.isRunning || !restTimer.startedAt) return;
        // Compute remaining from wall-clock time so the timer stays accurate
        // across phone sleep, tab backgrounding, and app switches.
        const elapsed = Math.floor((Date.now() - new Date(restTimer.startedAt).getTime()) / 1000);
        const remaining = Math.max(restTimer.duration - elapsed, 0);
        if (remaining <= 0) {
          set({ restTimer: { ...restTimer, isRunning: false, remaining: 0 } });
        } else {
          set({ restTimer: { ...restTimer, remaining } });
        }
      },

      getWorkoutData: () => {
        const { activeWorkout } = get();
        if (!activeWorkout) return null;
        const startTime = new Date(activeWorkout.startedAt).getTime();
        const rawDurationMinutes = Math.round((Date.now() - startTime) / 60000);
        const durationMinutes = rawDurationMinutes > 0 ? rawDurationMinutes : undefined;

        const exercises: WorkoutExerciseCreate[] = activeWorkout.exercises
          .filter((ex) => ex.sets.some((s) => s.reps > 0))
          .flatMap((exercise) => {
            if (exercise.unilateral) {
              const leftSets: SetData[] = [];
              const rightSets: SetData[] = [];

              for (let i = 0; i < exercise.sets.length; i += 2) {
                const left = exercise.sets[i];
                const right = exercise.sets[i + 1];
                if (left?.reps > 0) leftSets.push(left);
                if (right?.reps > 0) rightSets.push(right);
              }

              return ([
                { side: 'L' as const, sets: leftSets },
                { side: 'R' as const, sets: rightSets },
              ])
                .filter((entry) => entry.sets.length > 0)
                .map((entry) => {
                  const hasAnyRir = entry.sets.some((s) => s.rir !== undefined);
                  return {
                    exercise_name: exercise.name,
                    sets_completed: entry.sets.length,
                    reps: entry.sets.map((s) => s.reps),
                    weight: entry.sets.map((s) => s.weight),
                    rir: hasAnyRir ? entry.sets.map((s) => s.rir ?? 0) : undefined,
                    notes: exercise.notes || undefined,
                  };
                });
            }
            const validSets = exercise.sets.filter((s) => s.reps > 0);
            // Positional RIR: same length as reps/weight, default 0 for missing
            const hasAnyRir = validSets.some((s) => s.rir !== undefined);
            return [{
              exercise_name: exercise.name,
              sets_completed: validSets.length,
              reps: validSets.map((s) => s.reps),
              weight: validSets.map((s) => s.weight),
              rir: hasAnyRir ? validSets.map((s) => s.rir ?? 0) : undefined,
              notes: exercise.notes || undefined,
            }];
          });

        return {
          sessionName: activeWorkout.sessionName,
          completedAt: toWorkoutCompletionIso(activeWorkout.workoutDate),
          exercises,
          durationMinutes,
          sessionId: activeWorkout.sessionId,
          splitId: activeWorkout.splitId,
        };
      },
    }),
    {
      name: 'workout-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeWorkout: state.activeWorkout,
        selectedWorkoutDate: state.selectedWorkoutDate,
        currentExerciseIndex: state.currentExerciseIndex,
        exerciseNotesByKey: state.exerciseNotesByKey,
        restTimer: state.restTimer,
      }),
    },
  ),
);
