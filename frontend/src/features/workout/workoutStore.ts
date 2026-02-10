import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkoutExerciseCreate } from '@/types/api.types';
import { useSettingsStore } from '@/stores/settingsStore';

export interface SetData {
  reps: number;
  weight: number;
  rir?: number; // Reps in reserve (0-5)
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
  exercises: WorkoutExercise[];
  sessionId?: string;
  splitId?: string;
  programSessionId?: string;
  previousData?: Record<string, { reps: number[]; weight: number[] }>;
  retroDate?: string; // ISO string when user logs a past workout
}

interface RestTimerState {
  isRunning: boolean;
  duration: number;
  remaining: number;
  exerciseId: string | null;
}

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;
  restTimer: RestTimerState;

  // Workout actions
  startWorkout: (sessionName: string, retroDate?: string) => void;
  startWorkoutFromSession: (
    sessionName: string,
    exercises: Array<{ name: string; sets: number; unilateral: boolean }>,
    previousData?: Record<string, { reps: number[]; weight: number[] }>,
    sessionId?: string,
    splitId?: string,
    programSessionId?: string,
    retroDate?: string,
  ) => void;
  cancelWorkout: () => void;
  addExercise: (name: string, opts?: { unilateral?: boolean }) => void;
  removeExercise: (exerciseId: string) => void;
  addSet: (exerciseId: string) => void;
  removeSet: (exerciseId: string, setIndex: number) => void;
  updateSet: (
    exerciseId: string,
    setIndex: number,
    data: Partial<SetData>
  ) => void;
  completeSet: (exerciseId: string, setIndex: number) => void;
  updateExerciseNotes: (exerciseId: string, notes: string) => void;
  renameExercise: (exerciseId: string, newName: string) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;

  // Rest timer actions
  startRestTimer: (duration?: number, exerciseId?: string) => void;
  stopRestTimer: () => void;
  tickRestTimer: () => void;

  // Finalize workout
  getWorkoutData: () => {
    sessionName: string;
    exercises: WorkoutExerciseCreate[];
    durationMinutes: number;
    completedAt?: string;
    sessionId?: string;
    splitId?: string;
    programSessionId?: string;
  } | null;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      activeWorkout: null,
      restTimer: {
        isRunning: false,
        duration: 90,
        remaining: 0,
        exerciseId: null,
      },

      startWorkout: (sessionName, retroDate) => {
        set({
          activeWorkout: {
            sessionName,
            startedAt: retroDate || new Date().toISOString(),
            exercises: [],
            retroDate,
          },
        });
      },

      startWorkoutFromSession: (sessionName, exercises, previousData, sessionId, splitId, programSessionId, retroDate) => {
        const workoutExercises: WorkoutExercise[] = exercises.map((ex) => {
          const setCount = ex.sets;
          let sets: SetData[];

          if (ex.unilateral) {
            // Create L/R pairs for each planned set
            sets = [];
            for (let i = 0; i < setCount; i++) {
              sets.push({ reps: 0, weight: 0, completed: false }); // L
              sets.push({ reps: 0, weight: 0, completed: false }); // R
            }
          } else {
            sets = Array.from({ length: setCount }, () => ({
              reps: 0,
              weight: 0,
              completed: false,
            }));
          }

          return {
            id: generateId(),
            name: ex.name,
            sets,
            notes: '',
            unilateral: ex.unilateral || undefined,
          };
        });

        set({
          activeWorkout: {
            sessionName,
            startedAt: retroDate || new Date().toISOString(),
            exercises: workoutExercises,
            sessionId,
            splitId,
            programSessionId,
            previousData,
            retroDate,
          },
        });
      },

      cancelWorkout: () => {
        set({
          activeWorkout: null,
          restTimer: {
            isRunning: false,
            duration: 90,
            remaining: 0,
            exerciseId: null,
          },
        });
      },

      addExercise: (name, opts) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        const isUnilateral = opts?.unilateral ?? false;
        const initialSets: SetData[] = isUnilateral
          ? [
              { reps: 0, weight: 0, completed: false }, // L
              { reps: 0, weight: 0, completed: false }, // R
            ]
          : [{ reps: 0, weight: 0, completed: false }];

        const newExercise: WorkoutExercise = {
          id: generateId(),
          name,
          sets: initialSets,
          notes: '',
          unilateral: isUnilateral || undefined,
        };

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: [...activeWorkout.exercises, newExercise],
          },
        });
      },

      removeExercise: (exerciseId) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.filter(
              (e) => e.id !== exerciseId
            ),
          },
        });
      },

      addSet: (exerciseId) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((exercise) => {
              if (exercise.id !== exerciseId) return exercise;

              if (exercise.unilateral) {
                // For unilateral: copy from previous L/R pair (last two sets)
                const lastL = exercise.sets[exercise.sets.length - 2];
                const lastR = exercise.sets[exercise.sets.length - 1];
                const newL: SetData = lastL
                  ? { ...lastL, completed: false }
                  : { reps: 0, weight: 0, completed: false };
                const newR: SetData = lastR
                  ? { ...lastR, completed: false }
                  : { reps: 0, weight: 0, completed: false };
                return {
                  ...exercise,
                  sets: [...exercise.sets, newL, newR],
                };
              }

              // Copy values from last set if available
              const lastSet = exercise.sets[exercise.sets.length - 1];
              const newSet: SetData = lastSet
                ? { ...lastSet, completed: false }
                : { reps: 0, weight: 0, completed: false };

              return {
                ...exercise,
                sets: [...exercise.sets, newSet],
              };
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
            exercises: activeWorkout.exercises.map((exercise) => {
              if (exercise.id !== exerciseId) return exercise;

              if (exercise.unilateral) {
                // Remove both L and R of the pair (keep at least one pair)
                if (exercise.sets.length <= 2) return exercise;
                const pairStart = setIndex % 2 === 0 ? setIndex : setIndex - 1;
                return {
                  ...exercise,
                  sets: exercise.sets.filter((_, i) => i !== pairStart && i !== pairStart + 1),
                };
              }

              if (exercise.sets.length <= 1) return exercise; // Keep at least one set

              return {
                ...exercise,
                sets: exercise.sets.filter((_, i) => i !== setIndex),
              };
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
            exercises: activeWorkout.exercises.map((exercise) => {
              if (exercise.id !== exerciseId) return exercise;

              return {
                ...exercise,
                sets: exercise.sets.map((setData, i) =>
                  i === setIndex ? { ...setData, ...data } : setData
                ),
              };
            }),
          },
        });
      },

      completeSet: (exerciseId, setIndex) => {
        const { activeWorkout, startRestTimer, stopRestTimer } = get();
        if (!activeWorkout) return;

        // Find current completion state
        const exercise = activeWorkout.exercises.find((e) => e.id === exerciseId);
        const currentSet = exercise?.sets[setIndex];
        const wasCompleted = currentSet?.completed ?? false;

        // Toggle set completion
        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((ex) => {
              if (ex.id !== exerciseId) return ex;

              return {
                ...ex,
                sets: ex.sets.map((setData, i) =>
                  i === setIndex ? { ...setData, completed: !wasCompleted } : setData
                ),
              };
            }),
          },
        });

        // Start rest timer only when completing (not uncompleting)
        if (!wasCompleted) {
          const restDuration = useSettingsStore.getState().defaultRestDuration;
          startRestTimer(restDuration, exerciseId);
        } else {
          stopRestTimer();
        }
      },

      updateExerciseNotes: (exerciseId, notes) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((exercise) =>
              exercise.id === exerciseId ? { ...exercise, notes } : exercise
            ),
          },
        });
      },

      renameExercise: (exerciseId, newName) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises: activeWorkout.exercises.map((exercise) =>
              exercise.id === exerciseId ? { ...exercise, name: newName } : exercise
            ),
          },
        });
      },

      reorderExercises: (fromIndex, toIndex) => {
        const { activeWorkout } = get();
        if (!activeWorkout) return;

        const exercises = [...activeWorkout.exercises];
        const [removed] = exercises.splice(fromIndex, 1);
        exercises.splice(toIndex, 0, removed);

        set({
          activeWorkout: {
            ...activeWorkout,
            exercises,
          },
        });
      },

      startRestTimer: (duration, exerciseId) => {
        const timerDuration = duration ?? useSettingsStore.getState().defaultRestDuration;

        set({
          restTimer: {
            isRunning: true,
            duration: timerDuration,
            remaining: timerDuration,
            exerciseId: exerciseId ?? null,
          },
        });
      },

      stopRestTimer: () => {
        set({
          restTimer: {
            isRunning: false,
            duration: 90,
            remaining: 0,
            exerciseId: null,
          },
        });
      },

      tickRestTimer: () => {
        const { restTimer } = get();
        if (!restTimer.isRunning) return;

        const remaining = restTimer.remaining - 1;
        if (remaining <= 0) {
          set({
            restTimer: {
              ...restTimer,
              isRunning: false,
              remaining: 0,
            },
          });
        } else {
          set({
            restTimer: {
              ...restTimer,
              remaining,
            },
          });
        }
      },

      getWorkoutData: () => {
        const { activeWorkout } = get();
        if (!activeWorkout) return null;

        // Calculate duration
        const startTime = new Date(activeWorkout.startedAt).getTime();
        const endTime = Date.now();
        const durationMinutes = Math.round((endTime - startTime) / 60000);

        // Transform exercises to API format
        // Auto-save: count any set with reps > 0 as a valid set (no checkmark required)
        // For unilateral exercises, merge L/R pairs into single sets (L+R = 1 set)
        const exercises: WorkoutExerciseCreate[] = activeWorkout.exercises
          .filter((ex) => ex.sets.some((s) => s.reps > 0))
          .map((exercise) => {
            if (exercise.unilateral) {
              // Merge L/R pairs: take max reps/weight from each pair
              const merged: { reps: number; weight: number; rir?: number }[] = [];
              for (let i = 0; i < exercise.sets.length; i += 2) {
                const left = exercise.sets[i];
                const right = exercise.sets[i + 1];
                const lValid = left && left.reps > 0;
                const rValid = right && right.reps > 0;
                if (!lValid && !rValid) continue;
                merged.push({
                  reps: Math.max(left?.reps ?? 0, right?.reps ?? 0),
                  weight: Math.max(left?.weight ?? 0, right?.weight ?? 0),
                  rir: left?.rir ?? right?.rir,
                });
              }
              const rirValues = merged.map((s) => s.rir).filter((r): r is number => r !== undefined);
              return {
                exercise_name: exercise.name,
                sets_completed: merged.length,
                reps: merged.map((s) => s.reps),
                weight: merged.map((s) => s.weight),
                rir: rirValues.length > 0 ? rirValues : undefined,
                notes: exercise.notes || undefined,
              };
            }

            const validSets = exercise.sets.filter((s) => s.reps > 0);
            const rirValues = validSets.map((s) => s.rir).filter((r): r is number => r !== undefined);
            return {
              exercise_name: exercise.name,
              sets_completed: validSets.length,
              reps: validSets.map((s) => s.reps),
              weight: validSets.map((s) => s.weight),
              rir: rirValues.length > 0 ? rirValues : undefined,
              notes: exercise.notes || undefined,
            };
          });

        return {
          sessionName: activeWorkout.sessionName,
          exercises,
          durationMinutes,
          completedAt: activeWorkout.retroDate || undefined,
          sessionId: activeWorkout.sessionId,
          splitId: activeWorkout.splitId,
          programSessionId: activeWorkout.programSessionId,
        };
      },
    }),
    {
      name: 'workout-storage',
      partialize: (state) => ({
        activeWorkout: state.activeWorkout,
      }),
    }
  )
);
