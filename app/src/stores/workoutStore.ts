import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutExerciseCreate } from '../types/api.types';

export interface SetData {
  reps: number;
  weight: number;
  rir?: number;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: SetData[];
  notes: string;
  unilateral?: boolean;
}

interface ActiveWorkout {
  sessionName: string;
  startedAt: string;
  workoutDate?: string;
  exercises: WorkoutExercise[];
  sessionId?: string;
  splitId?: string;
  previousData?: Record<string, { reps: number[]; weight: number[]; rir?: (number | null)[] }>;
}

interface RestTimerState {
  isRunning: boolean;
  duration: number;
  remaining: number;
  exerciseId: string | null;
}

const DEFAULT_REST_DURATION = 90;

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function buildSideNote(side: 'L' | 'R', notes: string): string {
  const trimmed = notes.trim();
  return trimmed ? `${side} | ${trimmed}` : side;
}

function toWorkoutCompletionIso(workoutDate?: string): string | undefined {
  if (!workoutDate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workoutDate);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  const now = new Date();
  date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return date.toISOString();
}

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;
  selectedWorkoutDate: string | null;
  restTimer: RestTimerState;

  setSelectedWorkoutDate: (date: string | null) => void;
  startWorkout: (sessionName: string) => void;
  startWorkoutFromSession: (
    sessionName: string,
    exercises: Array<{ name: string; sets: number; unilateral: boolean }>,
    previousData?: ActiveWorkout['previousData'],
    sessionId?: string,
    splitId?: string,
  ) => void;
  cancelWorkout: () => void;
  addExercise: (name: string, opts?: { unilateral?: boolean }) => void;
  removeExercise: (exerciseId: string) => void;
  addSet: (exerciseId: string) => void;
  removeSet: (exerciseId: string, setIndex: number) => void;
  updateSet: (exerciseId: string, setIndex: number, data: Partial<SetData>) => void;
  completeSet: (exerciseId: string, setIndex: number) => void;
  updateExerciseNotes: (exerciseId: string, notes: string) => void;
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
      restTimer: { isRunning: false, duration: DEFAULT_REST_DURATION, remaining: 0, exerciseId: null },

      setSelectedWorkoutDate: (date) => {
        set({ selectedWorkoutDate: date });
      },

      startWorkout: (sessionName) => {
        const { selectedWorkoutDate } = get();
        set({
          activeWorkout: {
            sessionName,
            startedAt: new Date().toISOString(),
            workoutDate: selectedWorkoutDate ?? undefined,
            exercises: [],
          },
        });
      },

      startWorkoutFromSession: (sessionName, exercises, previousData, sessionId, splitId) => {
        const { selectedWorkoutDate } = get();
        const workoutExercises: WorkoutExercise[] = exercises.map((ex) => {
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
          return { id: generateId(), name: ex.name, sets, notes: '', unilateral: ex.unilateral || undefined };
        });
        set({
          activeWorkout: {
            sessionName,
            startedAt: new Date().toISOString(),
            workoutDate: selectedWorkoutDate ?? undefined,
            exercises: workoutExercises,
            sessionId,
            splitId,
            previousData,
          },
        });
      },

      cancelWorkout: () => {
        set({
          activeWorkout: null,
          restTimer: { isRunning: false, duration: DEFAULT_REST_DURATION, remaining: 0, exerciseId: null },
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
        if (!wasCompleted) startRestTimer(DEFAULT_REST_DURATION, exerciseId);
        else stopRestTimer();
      },

      updateExerciseNotes: (exerciseId, notes) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => (ex.id === exerciseId ? { ...ex, notes } : ex)),
          },
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
        const d = duration ?? DEFAULT_REST_DURATION;
        set({ restTimer: { isRunning: true, duration: d, remaining: d, exerciseId: exerciseId ?? null } });
      },

      stopRestTimer: () => {
        set({ restTimer: { isRunning: false, duration: DEFAULT_REST_DURATION, remaining: 0, exerciseId: null } });
      },

      tickRestTimer: () => {
        const { restTimer } = get();
        if (!restTimer.isRunning) return;
        const remaining = restTimer.remaining - 1;
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
                    notes: buildSideNote(entry.side, exercise.notes),
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
      }),
    },
  ),
);
