import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { autoSyncWorkout } from '../api/sync';
import { Exercise, getExercise } from '../data/exercises';
import { TEMPLATES as SEED_TEMPLATES, TemplateExercise, WorkoutTemplate } from '../data/templates';
import {
  computeWorkoutStimulus,
  levelsFromNet,
  rollingNet,
} from '../analysis/stimulus';
import type { AccountWorkoutPlan } from '../workout/splitSessions';

// Rest duration between sets. Fixed at 3 minutes for now — will be tuned /
// made adaptive later.
export const REST_SECONDS = 180;

export interface SetRecord {
  weight: number; // lbs
  reps: number;
  /** Reps in reserve; the backend accepts whole numbers from 0 through 5. */
  rir?: number;
}

export interface SessionExercise {
  exercise: Exercise;
  targetSets: number;
  completedSets: SetRecord[];
  /** Exercise cue carried into the next session for this exercise. */
  notes: string;
}

export interface ActiveSession {
  name: string;
  planned: boolean; // false = "add as you go"
  exercises: SessionExercise[];
  currentIndex: number;
  startedAt: number;
  /** True once the planned split was changed mid-session (swap/add) */
  edited: boolean;
}

export interface CompletedWorkout {
  date: string; // ISO
  name: string;
  exercises: { name: string; sets: number; records: SetRecord[]; notes: string }[];
  /** Raw per-region net stimulus from the engine (map to 0–7 via levelsFromNet) */
  stimulus: Record<string, number>;
  totalSets: number;
  volume: number; // total lbs moved (Σ weight × reps)
  durationMin: number;
  edited: boolean;
}

interface AppState {
  history: CompletedWorkout[];
  session: ActiveSession | null;
  lastCompleted: CompletedWorkout | null;
  /** Decayed 0–7 heat levels from recent history, for the home heatmap */
  recentStimulus: Record<string, number>;
  /** Last weight/reps used per exercise id, to prefill the set screen */
  lastUsed: Record<string, SetRecord>;
  /** Persistent exercise cues keyed by catalog exercise id. */
  exerciseNotes: Record<string, string>;
  templates: WorkoutTemplate[];
  addTemplate: (name: string, exercises: TemplateExercise[]) => void;
  updateTemplate: (id: string, name: string, exercises: TemplateExercise[]) => void;
  startTemplateSession: (template: WorkoutTemplate) => void;
  startPlannedSession: (plan: AccountWorkoutPlan) => void;
  startFreeSession: () => void;
  addExercise: (exercise: Exercise, sets?: number) => void;
  /** Swap the exercise at an index mid-session (marks the workout edited) */
  editExercise: (index: number, exercise: Exercise) => void;
  updateExerciseNotes: (exerciseId: string, notes: string) => void;
  /** Records one set and advances. */
  completeSet: (record: SetRecord) => void;
  /** Finish the session; pass the final set's record to include it atomically. */
  finishSession: (finalRecord?: SetRecord) => void;
  discardSession: () => void;
}

const AppStateContext = createContext<AppState | null>(null);

/**
 * Engine net stimulus for the sets actually completed this session, with the
 * recovery penalty applied for muscles trained again inside their window.
 */
function computeSessionStimulus(
  exercises: SessionExercise[],
  history: CompletedWorkout[]
): Record<string, number> {
  const now = Date.now();
  const hoursSinceByRegion: Record<string, number> = {};
  for (const w of history) {
    const hours = (now - new Date(w.date).getTime()) / 3_600_000;
    if (!Number.isFinite(hours) || hours < 0) continue;
    for (const region of Object.keys(w.stimulus)) {
      if (!(region in hoursSinceByRegion)) hoursSinceByRegion[region] = hours;
    }
  }
  return computeWorkoutStimulus(
    exercises
      .filter((se) => se.completedSets.length > 0)
      .map((se) => ({ exercise: se.exercise, sets: se.completedSets.length })),
    { hoursSinceByRegion }
  );
}

/** Home heatmap levels: decayed rolling net across history → 0–7 heat. */
function computeRecentStimulus(history: CompletedWorkout[]): Record<string, number> {
  const now = Date.now();
  const net = rollingNet(
    history.map((w) => ({
      stimulus: w.stimulus,
      daysAgo: (now - new Date(w.date).getTime()) / 86_400_000,
    }))
  );
  return levelsFromNet(net);
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Artificial history: four weeks of Push/Pull/Legs every other day, with
// per-workout stimulus computed by the real engine so the heatmap and
// analytics reflect what the app would actually produce.
function generateSeedHistory(): CompletedWorkout[] {
  const out: CompletedWorkout[] = [];
  const rotation = ['push', 'pull', 'legs'];
  let r = 0;
  for (let daysAgo = 1; daysAgo <= 27; daysAgo += 2) {
    const template = SEED_TEMPLATES.find((t) => t.id === rotation[r % rotation.length]);
    r++;
    if (!template) continue;
    const entries = template.exercises
      .map((te) => {
        const exercise = getExercise(te.exerciseId);
        return exercise ? { exercise, sets: te.sets } : null;
      })
      .filter((e): e is { exercise: Exercise; sets: number } => e !== null);
    const totalSets = entries.reduce((n, e) => n + e.sets, 0);
    const jitter = (daysAgo * 7919) % 13; // deterministic variation
    const exercisesWithRecords = entries.map((e, ei) => {
      const baseWeight = 40 + (((daysAgo * 31 + ei * 17) % 12) + 1) * 10;
      const records: SetRecord[] = Array.from({ length: e.sets }, (_, si) => ({
        weight: baseWeight,
        reps: 8 + ((daysAgo + ei + si) % 5),
      }));
      return { name: e.exercise.name, sets: e.sets, records, notes: '' };
    });
    const volume = exercisesWithRecords.reduce(
      (n, e) => n + e.records.reduce((m, r) => m + r.weight * r.reps, 0),
      0
    );
    out.push({
      date: daysAgoISO(daysAgo),
      name: template.name,
      exercises: exercisesWithRecords,
      stimulus: computeWorkoutStimulus(entries),
      totalSets,
      volume,
      durationMin: 44 + jitter,
      edited: daysAgo % 9 === 0, // a couple of edited sessions for realism
    });
  }
  return out;
}

const SEED_HISTORY: CompletedWorkout[] = generateSeedHistory();

const STORAGE_KEY = 'fitapp:v1';

interface PersistedState {
  history: CompletedWorkout[];
  templates: WorkoutTemplate[];
  lastUsed: Record<string, SetRecord>;
  exerciseNotes: Record<string, string>;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<CompletedWorkout[]>(SEED_HISTORY);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [lastCompleted, setLastCompleted] = useState<CompletedWorkout | null>(null);
  const [lastUsed, setLastUsed] = useState<Record<string, SetRecord>>({});
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(SEED_TEMPLATES);
  const [hydrated, setHydrated] = useState(false);

  // ── Local persistence: hydrate once, then save on every change ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const stored = JSON.parse(raw) as Partial<PersistedState>;
          if (Array.isArray(stored.history)) {
            // Sanitize entries persisted by older schema versions — missing
            // fields must never crash renders or the startup stimulus pass.
            setHistory(
              stored.history.map((w) => ({
                ...w,
                stimulus: w.stimulus && typeof w.stimulus === 'object' ? w.stimulus : {},
                edited: w.edited === true,
                totalSets: Number.isFinite(w.totalSets) ? w.totalSets : 0,
                volume: Number.isFinite(w.volume) ? w.volume : 0,
                durationMin: Number.isFinite(w.durationMin) ? w.durationMin : 0,
                exercises: Array.isArray(w.exercises)
                  ? w.exercises.map((e) => ({
                      ...e,
                      records: Array.isArray(e.records) ? e.records : [],
                      notes: typeof e.notes === 'string' ? e.notes : '',
                    }))
                  : [],
              }))
            );
          }
          if (Array.isArray(stored.templates) && stored.templates.length > 0) {
            setTemplates(stored.templates);
          }
          if (stored.lastUsed && typeof stored.lastUsed === 'object') {
            setLastUsed(stored.lastUsed);
          }
          if (stored.exerciseNotes && typeof stored.exerciseNotes === 'object') {
            setExerciseNotes(stored.exerciseNotes);
          }
        }
      })
      .catch(() => {
        // corrupted/missing store — fall back to seeds
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedState = { history, templates, lastUsed, exerciseNotes };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [hydrated, history, templates, lastUsed, exerciseNotes]);

  const recentStimulus = useMemo(() => computeRecentStimulus(history), [history]);

  // Guards a double finish landing before React re-renders (would duplicate
  // the history entry and double-fire sync). Keyed by the session start time.
  const finishedSessionRef = React.useRef<number | null>(null);

  const value: AppState = {
    history,
    session,
    lastCompleted,
    recentStimulus,
    lastUsed,
    exerciseNotes,
    templates,

    addTemplate: (name, exercises) => {
      const id = `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`;
      setTemplates((prev) => [...prev, { id, name, exercises }]);
    },

    updateTemplate: (id, name, exercises) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name, exercises } : t)));
    },

    startTemplateSession: (template) => {
      const exercises: SessionExercise[] = template.exercises
        .map((te): SessionExercise | null => {
          const exercise = getExercise(te.exerciseId);
          return exercise
            ? {
                exercise,
                targetSets: te.sets,
                completedSets: [],
                notes: exerciseNotes[exercise.id] ?? '',
              }
            : null;
        })
        .filter((se): se is SessionExercise => se !== null);
      setSession({
        name: template.name,
        planned: true,
        exercises,
        currentIndex: 0,
        startedAt: Date.now(),
        edited: false,
      });
    },

    startPlannedSession: (plan) => {
      const exercises: SessionExercise[] = plan.exercises.map(({ exercise, sets }) => ({
        exercise,
        targetSets: sets,
        completedSets: [],
        notes: exerciseNotes[exercise.id] ?? '',
      }));
      setSession({
        name: plan.name,
        planned: true,
        exercises,
        currentIndex: 0,
        startedAt: Date.now(),
        edited: false,
      });
    },

    startFreeSession: () => {
      setSession({
        name: 'Freeball',
        planned: false,
        exercises: [],
        currentIndex: 0,
        startedAt: Date.now(),
        edited: false,
      });
    },

    addExercise: (exercise, sets = 3) => {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // Adding to a planned split is an edit; add-as-you-go is the norm.
          edited: prev.edited || prev.planned,
          exercises: [
            ...prev.exercises,
            {
              exercise,
              targetSets: sets,
              completedSets: [],
              notes: exerciseNotes[exercise.id] ?? '',
            },
          ],
        };
      });
    },

    editExercise: (index, exercise) => {
      setSession((prev) => {
        if (!prev) return prev;
        const target = prev.exercises[index];
        if (!target) return prev;
        const edited = prev.edited || prev.planned;
        if (target.completedSets.length === 0) {
          // Nothing logged yet — swap in place.
          return {
            ...prev,
            edited,
            exercises: prev.exercises.map((se, i) =>
              i === index
                ? { ...se, exercise, notes: exerciseNotes[exercise.id] ?? '' }
                : se
            ),
          };
        }
        // Sets were already logged against the old exercise: freeze it with
        // what it earned and insert the new exercise for the remaining sets,
        // so history/stimulus/e1RM never reattribute completed work.
        const remaining = Math.max(1, target.targetSets - target.completedSets.length);
        const frozen = { ...target, targetSets: target.completedSets.length };
        const fresh = {
          exercise,
          targetSets: remaining,
          completedSets: [],
          notes: exerciseNotes[exercise.id] ?? '',
        };
        const exercises = [
          ...prev.exercises.slice(0, index),
          frozen,
          fresh,
          ...prev.exercises.slice(index + 1),
        ];
        return {
          ...prev,
          edited,
          exercises,
          currentIndex: prev.currentIndex === index ? index + 1 : prev.currentIndex,
        };
      });
    },

    updateExerciseNotes: (exerciseId, notes) => {
      const nextNotes = notes.slice(0, 500);
      setExerciseNotes((previous) => ({ ...previous, [exerciseId]: nextNotes }));
      setSession((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          exercises: previous.exercises.map((sessionExercise) =>
            sessionExercise.exercise.id === exerciseId
              ? { ...sessionExercise, notes: nextNotes }
              : sessionExercise
          ),
        };
      });
    },

    completeSet: (record) => {
      if (!session) return;
      const currentBefore = session.exercises[session.currentIndex];
      if (currentBefore) {
        setLastUsed((prev) => ({ ...prev, [currentBefore.exercise.id]: record }));
      }
      // Functional update: safe even if another update lands in the same batch.
      setSession((prev) => {
        if (!prev) return prev;
        const exercises = prev.exercises.map((se, i) =>
          i === prev.currentIndex ? { ...se, completedSets: [...se.completedSets, record] } : se
        );
        const current = exercises[prev.currentIndex];
        const exerciseDone = current && current.completedSets.length >= current.targetSets;
        return {
          ...prev,
          exercises,
          currentIndex: exerciseDone ? prev.currentIndex + 1 : prev.currentIndex,
        };
      });
    },

    finishSession: (finalRecord) => {
      // Side effects live OUTSIDE any state updater (StrictMode double-invokes
      // updaters). The optional finalRecord folds the last set in atomically
      // instead of relying on a completeSet queued in the same batch.
      const prev = session;
      if (!prev) return;
      if (finishedSessionRef.current === prev.startedAt) return; // already finished
      finishedSessionRef.current = prev.startedAt;
      let exercises = prev.exercises;
      if (finalRecord) {
        exercises = exercises.map((se, i) =>
          i === prev.currentIndex
            ? { ...se, completedSets: [...se.completedSets, finalRecord] }
            : se
        );
        const current = prev.exercises[prev.currentIndex];
        if (current) {
          setLastUsed((lu) => ({ ...lu, [current.exercise.id]: finalRecord }));
        }
      }
      const totalSets = exercises.reduce((n, se) => n + se.completedSets.length, 0);
      const volume = exercises.reduce(
        (n, se) => n + se.completedSets.reduce((m, s) => m + s.weight * s.reps, 0),
        0
      );
      const done: CompletedWorkout = {
        date: new Date().toISOString(),
        name: prev.name,
        exercises: exercises
          .filter((se) => se.completedSets.length > 0)
          .map((se) => ({
            name: se.exercise.name,
            sets: se.completedSets.length,
            records: se.completedSets,
            notes: se.notes,
          })),
        stimulus: computeSessionStimulus(exercises, history),
        totalSets,
        volume,
        durationMin: Math.max(1, Math.round((Date.now() - prev.startedAt) / 60_000)),
        edited: prev.edited,
      };
      setLastCompleted(done);
      setHistory((h) => [done, ...h]);
      setSession(null);
      autoSyncWorkout(done); // fire-and-forget when a backend is configured
    },

    discardSession: () => setSession(null),
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
