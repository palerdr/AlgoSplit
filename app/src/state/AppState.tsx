import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queueFailedWorkoutRetries, syncWorkout } from '../api/sync';
import { BackendError } from '../api/backend';
import { useAccountState } from './AccountState';
import {
  accountStorageKey,
  demoStorageKey,
  removeLegacyGlobalData,
} from './localPersistence';
import {
  nextSessionExerciseOrdinal,
  restoreActiveSession,
} from './activeSessionPersistence';
import {
  editCompletedSetInSession,
  lastUsedAfterCompletedSetEdit,
  type CompletedSetUpdate,
} from './completedSetEditing';
import { Exercise, getExercise } from '../data/exercises';
import { TEMPLATES as SEED_TEMPLATES, TemplateExercise, WorkoutTemplate } from '../data/templates';
import {
  computeWorkoutStimulus,
  levelsFromNet,
  rollingNet,
} from '../analysis/stimulus';
import type { AccountWorkoutPlan } from '../workout/splitSessions';
import {
  moveSessionExerciseIndex,
  nextIncompleteExerciseIndex,
} from '../workout/sessionNavigation';
import {
  completeSessionWarmupById,
  jumpToSessionExerciseById,
  preparePlannedSessionExercises,
  reorderSessionExercisesById,
  sessionWarmupPending,
  sessionExerciseIndexById,
  setSessionWarmupEnabledById,
  type PlannedSessionPreparation,
} from '../workout/sessionState';

export type { PlannedSessionPreparation } from '../workout/sessionState';
export type { CompletedSetUpdate } from './completedSetEditing';

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
  /** Stable for this live session even while the exercise order changes. */
  sessionExerciseId: string;
  exercise: Exercise;
  targetSets: number;
  /** One optional, session-only warmup that never contributes to work metrics. */
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  /** True when a direct live-order jump intentionally opens working sets. */
  warmupBypassed: boolean;
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
  splitId?: string;
  sessionId?: string;
}

export type SetCompletionKind = 'working' | 'warmup';

export interface SetCompletionSource {
  exerciseIndex: number;
  exerciseId: string;
  /** Preferred over exerciseIndex; remains valid after a session reorder. */
  sessionExerciseId?: string;
  /** Omitted by older callers and treated as a normal working set. */
  kind?: SetCompletionKind;
}

export type WorkoutSyncStatus = 'pending' | 'failed' | 'synced';

export interface CompletedWorkout {
  /** Stable client id used for durable, idempotent upload retries. */
  localId?: string;
  date: string; // ISO
  name: string;
  exercises: { name: string; sets: number; records: SetRecord[]; notes: string }[];
  /** Raw per-region net stimulus from the engine (map to 0–7 via levelsFromNet) */
  stimulus: Record<string, number>;
  totalSets: number;
  volume: number; // total lbs moved (Σ weight × reps)
  durationMin: number;
  edited: boolean;
  splitId?: string;
  sessionId?: string;
  syncStatus?: WorkoutSyncStatus;
  syncError?: string;
  remoteId?: string;
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
  pendingSyncCount: number;
  failedSyncCount: number;
  syncingWorkoutId: string | null;
  retryFailedWorkouts: () => void;
  addTemplate: (name: string, exercises: TemplateExercise[]) => void;
  updateTemplate: (id: string, name: string, exercises: TemplateExercise[]) => void;
  startTemplateSession: (template: WorkoutTemplate) => void;
  startPlannedSession: (
    plan: AccountWorkoutPlan,
    preparation?: PlannedSessionPreparation
  ) => void;
  startFreeSession: () => void;
  addExercise: (exercise: Exercise, sets?: number) => void;
  /** Swap the exercise at an index mid-session (marks the workout edited) */
  editExercise: (index: number, exercise: Exercise) => void;
  /** Move the live session's viewport without logging or editing workout data. */
  navigateSessionExercise: (direction: -1 | 1) => void;
  /** Jump directly to one stable row in the live session. */
  jumpToSessionExercise: (
    sessionExerciseId: string,
    options?: { bypassWarmup?: boolean }
  ) => void;
  /** Apply an exact stable-ID permutation while keeping the same row in view. */
  reorderSessionExercises: (orderedSessionExerciseIds: readonly string[]) => void;
  /** Warmup choice is editable only until that exercise records any set. */
  setSessionExerciseWarmupEnabled: (
    sessionExerciseId: string,
    enabled: boolean
  ) => void;
  /** Intentionally extend a completed exercise by one set. */
  addSetToExercise: (index: number) => void;
  updateExerciseNotes: (exerciseId: string, notes: string) => void;
  /** Records one set against its originating exercise and advances safely. */
  completeSet: (record: SetRecord, source?: SetCompletionSource) => void;
  /** Edit one committed working set without changing session shape or identity. */
  updateCompletedSet: (
    sessionExerciseId: string,
    setIndex: number,
    update: CompletedSetUpdate
  ) => boolean;
  /** Marks the optional warmup done without recording load, reps, or RIR. */
  completeWarmupSet: (source?: SetCompletionSource) => void;
  /** Finish using only working sets that were already committed safely. */
  finishSession: () => boolean;
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

function liveSessionExerciseId(startedAt: number, ordinal: number): string {
  return `session-${startedAt}-exercise-${ordinal}`;
}

/** Stable identity wins; the positional fallback keeps older callers working. */
function setCompletionExerciseIndex(
  session: ActiveSession,
  source?: SetCompletionSource
): number {
  if (source?.sessionExerciseId) {
    return sessionExerciseIndexById(session.exercises, source.sessionExerciseId);
  }
  return source?.exerciseIndex ?? session.currentIndex;
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

interface PersistedState {
  history: CompletedWorkout[];
  templates: WorkoutTemplate[];
  lastUsed: Record<string, SetRecord>;
  exerciseNotes: Record<string, string>;
  /** Null means there is no resumable workout for this account/device. */
  activeSession: ActiveSession | null;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const account = useAccountState();
  const authenticatedUserId = account.user?.id ?? null;
  const storageKey = authenticatedUserId
    ? accountStorageKey(authenticatedUserId)
    : demoStorageKey();
  const [history, setHistory] = useState<CompletedWorkout[]>(SEED_HISTORY);
  const [session, setSessionState] = useState<ActiveSession | null>(null);
  // React may batch two context actions from one interaction. Resolve every
  // session transaction against this synchronously updated snapshot so a
  // just-checked warmup cannot be overwritten by a working-set completion or
  // skipped by Finish before React renders the intermediate state.
  const sessionRef = React.useRef<ActiveSession | null>(session);
  sessionRef.current = session;
  const setSession = (
    update:
      | ActiveSession
      | null
      | ((previous: ActiveSession | null) => ActiveSession | null)
  ) => {
    const previous = sessionRef.current;
    const next = typeof update === 'function' ? update(previous) : update;
    if (next === previous) return;
    sessionRef.current = next;
    setSessionState(next);
  };
  const [lastCompleted, setLastCompleted] = useState<CompletedWorkout | null>(null);
  const [lastUsed, setLastUsedState] = useState<Record<string, SetRecord>>({});
  // Set completion and an immediate completed-set edit may share one event
  // batch. Keep their prefill shadow synchronous just like the live session.
  const lastUsedRef = React.useRef<Record<string, SetRecord>>(lastUsed);
  lastUsedRef.current = lastUsed;
  const setLastUsed = (
    update:
      | Record<string, SetRecord>
      | ((previous: Record<string, SetRecord>) => Record<string, SetRecord>)
  ) => {
    const previous = lastUsedRef.current;
    const next = typeof update === 'function' ? update(previous) : update;
    if (next === previous) return;
    lastUsedRef.current = next;
    setLastUsedState(next);
  };
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(SEED_TEMPLATES);
  const [hydrated, setHydrated] = useState(false);
  const [syncingWorkoutId, setSyncingWorkoutId] = useState<string | null>(null);
  const hydratedKeyRef = React.useRef<string | null>(null);
  const activeStorageKeyRef = React.useRef(storageKey);
  const syncInFlightRef = React.useRef<Set<string>>(new Set());
  const nextSessionExerciseOrdinalRef = React.useRef(0);
  const persistenceQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  activeStorageKeyRef.current = storageKey;

  useEffect(() => {
    removeLegacyGlobalData().catch(() => {});
  }, []);

  // ── Local persistence: hydrate separately for each authenticated user ──
  useEffect(() => {
    let cancelled = false;
    hydratedKeyRef.current = null;
    setHydrated(false);
    setSession(null);
    setLastCompleted(null);
    setLastUsed({});
    setExerciseNotes({});
    setHistory(authenticatedUserId ? [] : SEED_HISTORY);
    setTemplates(authenticatedUserId ? [] : SEED_TEMPLATES);

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          const stored = JSON.parse(raw) as Partial<PersistedState>;
          if (Array.isArray(stored.history)) {
            // Sanitize entries persisted by older schema versions — missing
            // fields must never crash renders or the startup stimulus pass.
            setHistory(
              stored.history.map((w, index) => ({
                ...w,
                localId: w.localId ?? `restored-${w.date}-${index}`,
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
                syncStatus:
                  w.syncStatus === 'pending' ||
                  w.syncStatus === 'failed' ||
                  w.syncStatus === 'synced'
                    ? w.syncStatus
                    : 'synced',
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
          const restoredSession = restoreActiveSession(stored.activeSession);
          if (restoredSession) {
            nextSessionExerciseOrdinalRef.current = nextSessionExerciseOrdinal(restoredSession);
            setSession(restoredSession);
          }
        }
      })
      .catch(() => {
        // corrupted/missing store — fall back to seeds
      })
      .finally(() => {
        if (cancelled) return;
        hydratedKeyRef.current = storageKey;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, storageKey]);

  useEffect(() => {
    if (!hydrated || hydratedKeyRef.current !== storageKey) return;
    const state: PersistedState = {
      history,
      templates,
      lastUsed,
      exerciseNotes,
      activeSession: session,
    };
    const serialized = JSON.stringify(state);
    // AsyncStorage does not guarantee that overlapping writes complete in call
    // order on every platform. Serialize them so an older set/navigation
    // snapshot can never overwrite the newest workout state.
    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => {})
      .then(() => {
        if (activeStorageKeyRef.current !== storageKey) return;
        return AsyncStorage.setItem(storageKey, serialized);
      })
      .catch(() => {});
  }, [storageKey, hydrated, history, templates, lastUsed, exerciseNotes, session]);

  const recentStimulus = useMemo(() => computeRecentStimulus(history), [history]);
  const pendingSyncCount = history.filter((workout) => workout.syncStatus === 'pending').length;
  const failedSyncCount = history.filter((workout) => workout.syncStatus === 'failed').length;

  useEffect(() => {
    if (!hydrated || account.status !== 'authenticated' || syncingWorkoutId) return;
    const candidate = history.find(
      (workout) => workout.syncStatus === 'pending' && workout.localId
    );
    if (!candidate?.localId || syncInFlightRef.current.has(candidate.localId)) return;

    const localId = candidate.localId;
    const syncStorageKey = storageKey;
    syncInFlightRef.current.add(localId);
    setSyncingWorkoutId(localId);
    syncWorkout(candidate)
      .then((remote) => {
        if (activeStorageKeyRef.current !== syncStorageKey) return;
        setHistory((previous) =>
          previous.map((workout) =>
            workout.localId === localId
              ? {
                  ...workout,
                  syncStatus: 'synced',
                  syncError: undefined,
                  remoteId: remote.id,
                }
              : workout
          )
        );
        account.refreshWorkouts().catch(() => {});
        account.refreshStimulus().catch(() => {});
      })
      .catch((error: unknown) => {
        if (activeStorageKeyRef.current !== syncStorageKey) return;
        setHistory((previous) =>
          previous.map((workout) =>
            workout.localId === localId
              ? {
                  ...workout,
                  syncStatus: 'failed',
                  syncError:
                    error instanceof Error ? error.message : 'Workout upload failed',
                }
              : workout
          )
        );
        if (error instanceof BackendError && error.status === 401) {
          account.refreshSession().catch(() => {});
        }
      })
      .finally(() => {
        syncInFlightRef.current.delete(localId);
        if (activeStorageKeyRef.current === syncStorageKey) setSyncingWorkoutId(null);
      });
  }, [
    account,
    history,
    hydrated,
    storageKey,
    syncingWorkoutId,
  ]);

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
    pendingSyncCount,
    failedSyncCount,
    syncingWorkoutId,
    retryFailedWorkouts: () => {
      setHistory((previous) => queueFailedWorkoutRetries(previous));
    },

    addTemplate: (name, exercises) => {
      const id = `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`;
      setTemplates((prev) => [...prev, { id, name, exercises }]);
    },

    updateTemplate: (id, name, exercises) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name, exercises } : t)));
    },

    startTemplateSession: (template) => {
      const startedAt = Date.now();
      const exercises: SessionExercise[] = template.exercises
        .map((te, sourceIndex): SessionExercise | null => {
          const exercise = getExercise(te.exerciseId);
          return exercise
            ? {
                sessionExerciseId: liveSessionExerciseId(startedAt, sourceIndex),
                exercise,
                targetSets: te.sets,
                warmupEnabled: false,
                warmupCompleted: false,
                warmupBypassed: false,
                completedSets: [],
                notes: exerciseNotes[exercise.id] ?? '',
              }
            : null;
        })
        .filter((se): se is SessionExercise => se !== null);
      nextSessionExerciseOrdinalRef.current = template.exercises.length;
      setSession({
        name: template.name,
        planned: true,
        exercises,
        currentIndex: 0,
        startedAt,
        edited: false,
      });
    },

    startPlannedSession: (plan, preparation) => {
      const startedAt = Date.now();
      const exercises: SessionExercise[] = preparePlannedSessionExercises(
        plan.exercises,
        preparation
      ).map(({ sourceIndex, value: { exercise, sets }, warmupEnabled }) => ({
        sessionExerciseId: liveSessionExerciseId(startedAt, sourceIndex),
        exercise,
        targetSets: sets,
        warmupEnabled,
        warmupCompleted: false,
        warmupBypassed: false,
        completedSets: [],
        notes: exerciseNotes[exercise.id] ?? '',
      }));
      nextSessionExerciseOrdinalRef.current = plan.exercises.length;
      setSession({
        name: plan.name,
        planned: true,
        exercises,
        currentIndex: 0,
        startedAt,
        edited: false,
        splitId: plan.splitId,
        sessionId: plan.sessionId,
      });
    },

    startFreeSession: () => {
      const startedAt = Date.now();
      nextSessionExerciseOrdinalRef.current = 0;
      setSession({
        name: 'Freeball',
        planned: false,
        exercises: [],
        currentIndex: 0,
        startedAt,
        edited: false,
      });
    },

    addExercise: (exercise, sets = 3) => {
      const ordinal = nextSessionExerciseOrdinalRef.current++;
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // Adding to a planned split is an edit; add-as-you-go is the norm.
          edited: prev.edited || prev.planned,
          exercises: [
            ...prev.exercises,
            {
              sessionExerciseId: liveSessionExerciseId(prev.startedAt, ordinal),
              exercise,
              targetSets: sets,
              warmupEnabled: false,
              warmupCompleted: false,
              warmupBypassed: false,
              completedSets: [],
              notes: exerciseNotes[exercise.id] ?? '',
            },
          ],
        };
      });
    },

    editExercise: (index, exercise) => {
      const replacementOrdinal = nextSessionExerciseOrdinalRef.current++;
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
                ? {
                    ...se,
                    exercise,
                    warmupCompleted: false,
                    warmupBypassed: false,
                    notes: exerciseNotes[exercise.id] ?? '',
                  }
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
          sessionExerciseId: liveSessionExerciseId(prev.startedAt, replacementOrdinal),
          exercise,
          targetSets: remaining,
          warmupEnabled: false,
          warmupCompleted: false,
          warmupBypassed: false,
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

    navigateSessionExercise: (direction) => {
      setSession((prev) => {
        if (!prev) return prev;
        const currentIndex = moveSessionExerciseIndex(
          prev.currentIndex,
          prev.exercises.length,
          direction
        );
        return currentIndex === prev.currentIndex ? prev : { ...prev, currentIndex };
      });
    },

    jumpToSessionExercise: (sessionExerciseId, options) => {
      setSession((prev) => {
        if (!prev) return prev;
        const jump = jumpToSessionExerciseById(
          prev.exercises,
          prev.currentIndex,
          sessionExerciseId,
          options
        );
        return jump.changed
          ? { ...prev, exercises: jump.exercises, currentIndex: jump.currentIndex }
          : prev;
      });
    },

    reorderSessionExercises: (orderedSessionExerciseIds) => {
      setSession((prev) => {
        if (!prev) return prev;
        const reordered = reorderSessionExercisesById(
          prev.exercises,
          prev.currentIndex,
          orderedSessionExerciseIds
        );
        if (!reordered.changed) return prev;
        return {
          ...prev,
          exercises: reordered.exercises,
          currentIndex: reordered.currentIndex,
          edited: prev.edited || prev.planned,
        };
      });
    },

    setSessionExerciseWarmupEnabled: (sessionExerciseId, enabled) => {
      setSession((prev) => {
        if (!prev) return prev;
        const exercises = setSessionWarmupEnabledById(
          prev.exercises,
          sessionExerciseId,
          enabled
        );
        return exercises.every((exercise, index) => exercise === prev.exercises[index])
          ? prev
          : { ...prev, exercises };
      });
    },

    addSetToExercise: (index) => {
      setSession((prev) => {
        if (!prev) return prev;
        const target = prev.exercises[index];
        if (!target) return prev;
        const targetSets = Math.max(target.targetSets, target.completedSets.length) + 1;
        return {
          ...prev,
          edited: prev.edited || prev.planned,
          currentIndex: index,
          exercises: prev.exercises.map((exercise, exerciseIndex) =>
            exerciseIndex === index ? { ...exercise, targetSets } : exercise
          ),
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

    completeSet: (record, source) => {
      const activeSession = sessionRef.current;
      if (!activeSession || source?.kind === 'warmup') return;
      const exerciseIndex = setCompletionExerciseIndex(activeSession, source);
      const target = activeSession.exercises[exerciseIndex];
      if (
        !target ||
        (source && target.exercise.id !== source.exerciseId) ||
        !Number.isInteger(target.targetSets) ||
        target.targetSets < 1 ||
        sessionWarmupPending(target) ||
        target.completedSets.length >= target.targetSets
      ) return;

      // Build the accepted transaction once, then batch the session and shadow
      // updates from that exact snapshot. A rejected set can no longer mutate
      // lastUsed independently of completedSets.
      const exercises = activeSession.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? { ...exercise, completedSets: [...exercise.completedSets, record] }
          : exercise
      );
      const completed = exercises[exerciseIndex];
      const exerciseDone = completed.completedSets.length >= completed.targetSets;
      const currentIndex =
        activeSession.currentIndex === exerciseIndex && exerciseDone
          ? nextIncompleteExerciseIndex(exercises, exerciseIndex)
          : activeSession.currentIndex;
      setSession({ ...activeSession, exercises, currentIndex });
      setLastUsed((previous) => ({ ...previous, [target.exercise.id]: record }));
    },

    updateCompletedSet: (sessionExerciseId, setIndex, update) => {
      const activeSession = sessionRef.current;
      if (!activeSession) return false;
      const edit = editCompletedSetInSession(
        activeSession,
        sessionExerciseId,
        setIndex,
        update
      );
      if (!edit) return false;
      if (edit.changed) setSession(edit.session);
      setLastUsed((previous) => lastUsedAfterCompletedSetEdit(previous, edit));
      return true;
    },

    completeWarmupSet: (source) => {
      const activeSession = sessionRef.current;
      if (!activeSession || source?.kind === 'working') return;
      const exerciseIndex = setCompletionExerciseIndex(activeSession, source);
      const currentBefore = activeSession.exercises[exerciseIndex];
      if (!currentBefore || (source && currentBefore.exercise.id !== source.exerciseId)) return;

      // Deliberately no SetRecord and no setLastUsed update. Warmup weight is
      // outside the product model and cannot leak into volume or set shadows.
      setSession((prev) => {
        if (!prev) return prev;
        const resolvedIndex = setCompletionExerciseIndex(prev, source);
        const target = prev.exercises[resolvedIndex];
        if (!target || (source && target.exercise.id !== source.exerciseId)) return prev;
        const exercises = completeSessionWarmupById(
          prev.exercises,
          target.sessionExerciseId
        );
        return exercises.every((exercise, index) => exercise === prev.exercises[index])
          ? prev
          : { ...prev, exercises };
      });
    },

    finishSession: () => {
      // Side effects live OUTSIDE any state updater (StrictMode double-invokes
      // updaters). Every working set is committed before Finish becomes usable;
      // keeping this action record-free prevents it bypassing warmup guards.
      const prev = sessionRef.current;
      if (!prev) return false;
      if (finishedSessionRef.current === prev.startedAt) return false; // already finished
      // A checked warmup is a real required step. The live order menu is the
      // one explicit override; otherwise Finish cannot silently abandon it.
      if (prev.exercises.some(sessionWarmupPending)) return false;
      const exercises = prev.exercises;
      const totalSets = exercises.reduce((n, se) => n + se.completedSets.length, 0);
      // A warmup never creates a workout by itself. The UI normally exposes
      // Discard instead of Finish here; keep the state API equally strict so
      // an empty workout cannot enter history or fail backend validation.
      if (totalSets === 0) return false;
      finishedSessionRef.current = prev.startedAt;
      const volume = exercises.reduce(
        (n, se) => n + se.completedSets.reduce((m, s) => m + s.weight * s.reps, 0),
        0
      );
      const done: CompletedWorkout = {
        localId: `workout-${prev.startedAt}-${Date.now()}`,
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
        splitId: prev.splitId,
        sessionId: prev.sessionId,
        syncStatus: account.status === 'authenticated' ? 'pending' : undefined,
      };
      setLastCompleted(done);
      setHistory((h) => [done, ...h]);
      setSession(null);
      return true;
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
