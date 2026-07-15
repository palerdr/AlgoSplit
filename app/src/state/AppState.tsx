import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Exercise, getExercise } from '../data/exercises';
import { TEMPLATES as SEED_TEMPLATES, TemplateExercise, WorkoutTemplate } from '../data/templates';
import {
  computeWorkoutStimulus,
  levelsFromNet,
  rollingNet,
} from '../analysis/stimulus';

// Rest duration between sets. Fixed at 3 minutes for now — will be tuned /
// made adaptive later.
export const REST_SECONDS = 180;

export interface SetRecord {
  weight: number; // lbs
  reps: number;
}

export interface SessionExercise {
  exercise: Exercise;
  targetSets: number;
  completedSets: SetRecord[];
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
  exercises: { name: string; sets: number; records: SetRecord[] }[];
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
  templates: WorkoutTemplate[];
  addTemplate: (name: string, exercises: TemplateExercise[]) => void;
  updateTemplate: (id: string, name: string, exercises: TemplateExercise[]) => void;
  startTemplateSession: (template: WorkoutTemplate) => void;
  startFreeSession: () => void;
  addExercise: (exercise: Exercise, sets?: number) => void;
  /** Swap the exercise at an index mid-session (marks the workout edited) */
  editExercise: (index: number, exercise: Exercise) => void;
  /** Records one set and advances. Returns true if the planned session just finished. */
  completeSet: (record: SetRecord) => boolean;
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
      return { name: e.exercise.name, sets: e.sets, records };
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
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<CompletedWorkout[]>(SEED_HISTORY);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [lastCompleted, setLastCompleted] = useState<CompletedWorkout | null>(null);
  const [lastUsed, setLastUsed] = useState<Record<string, SetRecord>>({});
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(SEED_TEMPLATES);
  const [hydrated, setHydrated] = useState(false);

  // ── Local persistence: hydrate once, then save on every change ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const stored = JSON.parse(raw) as Partial<PersistedState>;
          if (Array.isArray(stored.history)) setHistory(stored.history);
          if (Array.isArray(stored.templates) && stored.templates.length > 0) {
            setTemplates(stored.templates);
          }
          if (stored.lastUsed && typeof stored.lastUsed === 'object') {
            setLastUsed(stored.lastUsed);
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
    const state: PersistedState = { history, templates, lastUsed };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [hydrated, history, templates, lastUsed]);

  const recentStimulus = useMemo(() => computeRecentStimulus(history), [history]);

  const value: AppState = {
    history,
    session,
    lastCompleted,
    recentStimulus,
    lastUsed,
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
          return exercise ? { exercise, targetSets: te.sets, completedSets: [] } : null;
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

    startFreeSession: () => {
      setSession({
        name: 'Freestyle',
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
          exercises: [...prev.exercises, { exercise, targetSets: sets, completedSets: [] }],
        };
      });
    },

    editExercise: (index, exercise) => {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // Swapping in a planned split is an edit; freestyle swaps are normal.
          edited: prev.edited || prev.planned,
          exercises: prev.exercises.map((se, i) => (i === index ? { ...se, exercise } : se)),
        };
      });
    },

    completeSet: (record) => {
      if (!session) return false;
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
      const willAdvance =
        currentBefore && currentBefore.completedSets.length + 1 >= currentBefore.targetSets;
      const nextIndex = willAdvance ? session.currentIndex + 1 : session.currentIndex;
      return session.planned && nextIndex >= session.exercises.length;
    },

    finishSession: (finalRecord) => {
      // Side effects live OUTSIDE any state updater (StrictMode double-invokes
      // updaters). The optional finalRecord folds the last set in atomically
      // instead of relying on a completeSet queued in the same batch.
      const prev = session;
      if (!prev) return;
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
