import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ScrollView as RNScrollView,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import DraggableFlatList, { NestableDraggableFlatList, NestableScrollContainer } from 'react-native-draggable-flatlist';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchPreviousWorkoutData } from '../../../src/hooks/useWorkouts';
import {
  useSplit,
  useSplitAnalysis,
  prefetchSplitAnalysisWithBreakdowns,
  useDeleteSplit,
  useDuplicateSplit,
  useReplaceSplit,
  useUpdateSplit,
  useUpdateSplitExercises,
} from '../../../src/hooks/useSplits';
import { getErrorMessage } from '../../../src/api/client';
import { Spinner, Card, InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import SessionEditorMobile from '../../../src/components/splits/SessionEditorMobile';
import SplitAnalysisPageMobile from '../../../src/components/splits/SplitAnalysisPageMobile';
import {
  splitResponseToEditable,
  editableToSplitRequest,
  hasChanges as checkHasChanges,
  generateExerciseId,
  generateSessionId,
  normalizeSessionsForSave,
  parseCycleLengthInput,
  parseStimulusDurationInput,
  parseMaintenanceVolumeInput,
} from '../../../src/utils/splitEditHelpers';
import { colors, borders, spacing } from '../../../src/theme';
import { triggerExpandTransition } from '../../../src/utils/workoutTransition';
import { useWorkoutStore } from '../../../src/stores/workoutStore';
import { confirm } from '../../../src/utils/confirm';
import type { SessionInput, SessionResponse, SplitUpdate } from '../../../src/types/api.types';
import type { SplitExerciseBatchUpdateItem } from '../../../src/api/splits.api';

function buildFastExercisePatches(
  originalSessions: SessionInput[],
  editedSessions: SessionInput[]
): { canUseFastPath: boolean; updates: SplitExerciseBatchUpdateItem[] } {
  if (originalSessions.length !== editedSessions.length) {
    return { canUseFastPath: false, updates: [] };
  }

  const updates: SplitExerciseBatchUpdateItem[] = [];

  for (let i = 0; i < originalSessions.length; i += 1) {
    const originalSession = originalSessions[i];
    const editedSession = editedSessions[i];

    // Session-level edits still require full replacement.
    if (
      originalSession.name.trim() !== editedSession.name.trim() ||
      originalSession.day !== editedSession.day
    ) {
      return { canUseFastPath: false, updates: [] };
    }

    if (originalSession.exercises.length !== editedSession.exercises.length) {
      return { canUseFastPath: false, updates: [] };
    }

    for (let j = 0; j < originalSession.exercises.length; j += 1) {
      const originalExercise = originalSession.exercises[j];
      const editedExercise = editedSession.exercises[j];

      // Reorder/new rows/deletes require full replacement.
      if (!originalExercise.id || !editedExercise.id || originalExercise.id !== editedExercise.id) {
        return { canUseFastPath: false, updates: [] };
      }

      const update: SplitExerciseBatchUpdateItem = { id: editedExercise.id };
      let changed = false;

      const originalName = originalExercise.name.trim();
      const editedName = editedExercise.name.trim();
      if (originalName !== editedName) {
        update.name = editedName;
        changed = true;
      }

      if (originalExercise.sets !== editedExercise.sets) {
        update.sets = editedExercise.sets;
        changed = true;
      }

      const originalUnilateral = originalExercise.unilateral ?? false;
      const editedUnilateral = editedExercise.unilateral ?? false;
      if (originalUnilateral !== editedUnilateral) {
        update.unilateral = editedUnilateral;
        changed = true;
      }

      const originalResistance = originalExercise.resistance_profile ?? null;
      const editedResistance = editedExercise.resistance_profile ?? null;
      if (originalResistance !== editedResistance) {
        update.resistance_profile = editedResistance;
        changed = true;
      }

      if (changed) {
        updates.push(update);
      }
    }
  }

  return { canUseFastPath: true, updates };
}

function isNotFoundError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

function nextAvailableDay(sessions: SessionInput[]): number | null {
  const usedDays = new Set(sessions.map((session) => session.day));
  for (let day = 1; day <= 7; day += 1) {
    if (!usedDays.has(day)) return day;
  }
  return null;
}

function reorderSessionsWithStableDays(
  previous: SessionInput[],
  activeId: string,
  targetId: string,
): SessionInput[] {
  const fromIndex = previous.findIndex((session) => session.id === activeId);
  const toIndex = previous.findIndex((session) => session.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return previous;
  }

  const reordered = [...previous];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  const daySlots = [...previous]
    .map((session) => session.day)
    .sort((a, b) => a - b);

  return reordered.map((session, index) => ({
    ...session,
    day: daySlots[index] ?? Math.min(index + 1, 7),
  }));
}

export default function SplitDetailScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: split, isLoading: splitLoading } = useSplit(id);
  const { data: analysis, isLoading: analysisLoading, error: analysisError } = useSplitAnalysis(
    id,
    !!split,
    split,
  );
  const deleteMutation = useDeleteSplit();
  const duplicateMutation = useDuplicateSplit();
  const replaceMutation = useReplaceSplit({ invalidateLists: false });
  const updateMutation = useUpdateSplit({ invalidateLists: false });
  const updateExercisesMutation = useUpdateSplitExercises();

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSessions, setEditSessions] = useState<SessionInput[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Split / Analysis page switcher. The analysis used to live below the
  // sessions list under a "Detailed Analysis" collapse; it's now a peer page
  // swiped to horizontally. Edit mode pins the user to page 0 (Split) so a
  // pending edit can't be lost by swiping to Analysis.
  // Split / Analysis are toggled exclusively by the segmented control below.
  // A horizontal swipe-pager was attempted but couldn't reliably arbitrate the
  // horizontal pan against the nested vertical scrollables on iOS, so it was
  // removed in favor of the tap toggle (which always works). Only the active
  // page is mounted; switching is a plain state change.
  const [activePage, setActivePage] = useState<0 | 1>(0);
  const goToPage = useCallback((page: 0 | 1) => setActivePage(page), []);
  const [isDraggingExercises, setIsDraggingExercises] = useState(false);
  const [isDraggingSessions, setIsDraggingSessions] = useState(false);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sessionListRef = useRef<any>(null);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWeb = Platform.OS === 'web';
  const ScrollContainerComponent: any = Platform.OS === 'web' ? ScrollView : NestableScrollContainer;
  const SessionListComponent: any = Platform.OS === 'web' ? DraggableFlatList : NestableDraggableFlatList;

  const handleDragStart = useCallback(() => {
    setIsDraggingExercises(true);
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    dragResetTimerRef.current = setTimeout(() => {
      setIsDraggingExercises(false);
      dragResetTimerRef.current = null;
    }, 2500);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragResetTimerRef.current) {
      clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = null;
    }
    setIsDraggingExercises(false);
  }, []);

  const handleSessionDragStart = useCallback(() => {
    setIsDraggingSessions(true);
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setIsDraggingSessions(false);
  }, []);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    };
  }, []);

  const handleWebSessionMove = useCallback((targetId: string) => {
    if (!draggingSessionId || draggingSessionId === targetId) return;

    setEditSessions((previous) => reorderSessionsWithStableDays(previous, draggingSessionId, targetId));
  }, [draggingSessionId]);

  // Refs keep closures up-to-date without re-running the drag effect mid-drag
  const sessionMoveRef = useRef(handleWebSessionMove);
  sessionMoveRef.current = handleWebSessionMove;
  const sessionDragEndRef = useRef(handleSessionDragEnd);
  sessionDragEndRef.current = handleSessionDragEnd;
  const sessionDragRef = useRef<{ startY: number; el: HTMLElement | null; initialized: boolean }>({
    startY: 0, el: null, initialized: false,
  });

  useEffect(() => {
    if (!isWeb || !draggingSessionId || typeof window === 'undefined') return;

    const dragEl = document.getElementById(`drag-session-${draggingSessionId}`);
    sessionDragRef.current = { startY: 0, el: dragEl, initialized: false };
    if (dragEl) {
      dragEl.style.zIndex = '999';
      dragEl.style.position = 'relative';
      dragEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
      dragEl.style.opacity = '0.95';
    }

    const stopSessionDrag = () => {
      const { el } = sessionDragRef.current;
      if (el) {
        el.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s, opacity 0.15s';
        el.style.transform = '';
        el.style.boxShadow = '';
        el.style.opacity = '';
        setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; el.style.position = ''; }, 160);
      }
      sessionDragRef.current = { startY: 0, el: null, initialized: false };
      setDraggingSessionId(null);
      sessionDragEndRef.current();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = sessionDragRef.current;
      if (!state.initialized) {
        state.initialized = true;
        state.startY = e.clientY;
      }
      if (state.el) {
        state.el.style.transition = 'none';
        state.el.style.transform = `translateY(${e.clientY - state.startY}px) scale(1.01)`;
      }

      if (state.el) state.el.style.pointerEvents = 'none';
      const hitEl = document.elementFromPoint(e.clientX, e.clientY);
      if (state.el) state.el.style.pointerEvents = '';

      if (!hitEl) return;
      const wrapper = (hitEl as HTMLElement).closest?.('[id^="drag-session-"]');
      if (wrapper) {
        const targetId = wrapper.id.replace('drag-session-', '');
        if (targetId && targetId !== draggingSessionId) {
          // Only swap once the pointer crosses the target's vertical center
          const targetRect = wrapper.getBoundingClientRect();
          const targetCenterY = targetRect.top + targetRect.height / 2;
          const movingDown = e.clientY > state.startY;
          if (movingDown ? e.clientY < targetCenterY : e.clientY > targetCenterY) return;

          const oldRect = state.el?.getBoundingClientRect();
          sessionMoveRef.current(targetId);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!sessionDragRef.current.el) return; // drag ended, skip
            const newEl = document.getElementById(`drag-session-${draggingSessionId}`);
            if (newEl && oldRect) {
              const newRect = newEl.getBoundingClientRect();
              state.startY += newRect.top - oldRect.top;
              state.el = newEl;
              newEl.style.transition = 'none';
              newEl.style.transform = `translateY(${e.clientY - state.startY}px) scale(1.01)`;
              newEl.style.zIndex = '999';
              newEl.style.position = 'relative';
              newEl.style.opacity = '0.95';
              newEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
            }
          }));
        }
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopSessionDrag);
    window.addEventListener('mouseup', stopSessionDrag);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopSessionDrag);
      window.removeEventListener('mouseup', stopSessionDrag);
    };
  }, [draggingSessionId, isWeb]);

  useEffect(() => {
    if (!split || !analysis) return;

    void prefetchSplitAnalysisWithBreakdowns(queryClient, split.id, split);
  }, [queryClient, split, analysis]);


  // Advanced settings — always interactive, independent from edit mode
  const [advDataset, setAdvDataset] = useState<'schoenfeld' | 'pelland' | 'average'>('average');
  const [advCycleLength, setAdvCycleLength] = useState('');
  const [advStimulusDuration, setAdvStimulusDuration] = useState('48');
  const [advMaintenanceVolume, setAdvMaintenanceVolume] = useState('4');

  // Sync advanced settings from split data when it loads/changes
  useEffect(() => {
    if (split) {
      // Display clamped values: a split persisted with an out-of-range setting
      // shows the valid value its analysis actually runs with, and a blur/save
      // then heals the stored value.
      setAdvDataset((split.dataset as 'schoenfeld' | 'pelland' | 'average') ?? 'average');
      setAdvCycleLength(split.cycle_length != null ? String(parseCycleLengthInput(split.cycle_length) ?? '') : '');
      setAdvStimulusDuration(String(parseStimulusDurationInput(split.stimulus_duration)));
      setAdvMaintenanceVolume(String(parseMaintenanceVolumeInput(split.maintenance_volume)));
    }
  }, [split]);

  // (top/bottom muscle derivation moved into SplitAnalysisPageMobile.)

  const enterEditMode = useCallback(() => {
    if (!split) return;
    const editable = splitResponseToEditable(split);
    setEditName(editable.name);
    setEditSessions(editable.sessions);
    setIsEditing(true);
    // Edit mode lives on the Split page; switch there so a pending edit can't
    // be hidden behind the Analysis tab.
    goToPage(0);
  }, [split, goToPage]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    // Revert advanced settings to saved values (clamped to valid ranges)
    if (split) {
      setAdvDataset((split.dataset as 'schoenfeld' | 'pelland' | 'average') ?? 'average');
      setAdvCycleLength(split.cycle_length != null ? String(parseCycleLengthInput(split.cycle_length) ?? '') : '');
      setAdvStimulusDuration(String(parseStimulusDurationInput(split.stimulus_duration)));
      setAdvMaintenanceVolume(String(parseMaintenanceVolumeInput(split.maintenance_volume)));
    }
  }, [split]);

  // Edit-mode dirty check (includes advanced settings)
  const dirty = useMemo(() => {
    if (!split || !isEditing) return false;
    const parsedCycleLength = parseCycleLengthInput(advCycleLength);
    const current = {
      name: editName,
      sessions: editSessions,
      dataset: advDataset,
      cycle_length: parsedCycleLength,
      stimulus_duration: parseStimulusDurationInput(advStimulusDuration),
      maintenance_volume: parseMaintenanceVolumeInput(advMaintenanceVolume),
    };
    return checkHasChanges(split, current);
  }, [split, isEditing, editName, editSessions, advDataset, advCycleLength, advStimulusDuration, advMaintenanceVolume]);

  const handleSave = useCallback(async () => {
    if (!id || !dirty || !split) return;
    try {
      const namedSessions = editSessions.filter((session) => session.name.trim());
      if (namedSessions.length === 0) {
        Alert.alert('Error', 'Add at least one session with a named exercise.');
        return;
      }

      const dayOutOfRange = namedSessions.find((session) => session.day < 1 || session.day > 7);
      if (dayOutOfRange) {
        Alert.alert('Error', 'Session days must be between 1 and 7.');
        return;
      }

      const emptyNamedSession = namedSessions.find(
        (session) => !session.exercises.some((exercise) => exercise.name.trim()),
      );
      if (emptyNamedSession) {
        Alert.alert(
          'Error',
          `"${emptyNamedSession.name}" has no exercises. Rest days are implicit, so leave them out. Auto cycle length ends on your last training day, and a longer cycle length extends the split with trailing rest days.`,
        );
        return;
      }

      const parsedCycleLength = parseCycleLengthInput(advCycleLength);
      if (advCycleLength.trim() && parsedCycleLength == null) {
        Alert.alert('Error', 'Cycle length must be between 1 and 7 days.');
        return;
      }
      if (parsedCycleLength != null && namedSessions.length > parsedCycleLength) {
        Alert.alert('Error', 'Cycle length cannot be shorter than the number of training days in the split.');
        return;
      }

      const normalizedSessions = normalizeSessionsForSave(namedSessions, parsedCycleLength);

      const originalEditable = splitResponseToEditable(split);
      const { canUseFastPath, updates } = buildFastExercisePatches(
        originalEditable.sessions,
        normalizedSessions
      );

      const metadataUpdate: SplitUpdate = {};
      const nextName = editName.trim();
      const currentName = split.name.trim();
      if (nextName !== currentName) {
        metadataUpdate.name = nextName;
      }
      const nextDataset = advDataset;
      const nextCycleLength = parsedCycleLength ?? null;
      const nextStimulus = parseStimulusDurationInput(advStimulusDuration);
      const nextMaintenance = parseMaintenanceVolumeInput(advMaintenanceVolume);
      if (nextDataset !== split.dataset) metadataUpdate.dataset = nextDataset;
      if (nextCycleLength !== (split.cycle_length ?? null)) metadataUpdate.cycle_length = nextCycleLength;
      if (nextStimulus !== (split.stimulus_duration ?? 48)) metadataUpdate.stimulus_duration = nextStimulus;
      if (nextMaintenance !== (split.maintenance_volume ?? 3)) metadataUpdate.maintenance_volume = nextMaintenance;

      if (canUseFastPath) {
        if (__DEV__) {
          console.log('[split-save] path=fast-batch', { updates: updates.length });
        }
        try {
          const promises: Promise<unknown>[] = [];
          if (Object.keys(metadataUpdate).length > 0) {
            promises.push(updateMutation.mutateAsync({ id, data: metadataUpdate }));
          }
          if (updates.length > 0) {
            promises.push(updateExercisesMutation.mutateAsync({ id, updates }));
          }
          if (promises.length > 0) {
            await Promise.all(promises);
          }
          setIsEditing(false);
          return;
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          if (__DEV__) {
            console.log('[split-save] fast-batch unavailable, falling back to full-replace');
          }
        }
      }

      if (__DEV__) {
        console.log('[split-save] path=full-replace');
      }
      await replaceMutation.mutateAsync({
        id,
        data: editableToSplitRequest({
          name: editName,
          sessions: normalizedSessions,
          dataset: advDataset,
          cycle_length: nextCycleLength ?? undefined,
          stimulus_duration: nextStimulus,
          maintenance_volume: nextMaintenance,
        }),
      });
      setIsEditing(false);
    } catch {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    }
  }, [
    id,
    dirty,
    split,
    editName,
    editSessions,
    advDataset,
    advCycleLength,
    advStimulusDuration,
    advMaintenanceVolume,
    replaceMutation,
    updateMutation,
    updateExercisesMutation,
  ]);

  // Auto-save advanced settings when changed outside edit mode
  const saveAdvancedSettings = useCallback(
    (overrides?: {
      dataset?: 'schoenfeld' | 'pelland' | 'average';
      cycle_length?: number | null;
      stimulus_duration?: number;
      maintenance_volume?: number;
    }) => {
      if (!split || !id || isEditing) return;
      const nextDataset =
        overrides?.dataset ?? ((advDataset as 'schoenfeld' | 'pelland' | 'average') ?? 'average');
      const nextCycleLength =
        overrides?.cycle_length ??
        (() => {
          return parseCycleLengthInput(advCycleLength) ?? null;
        })();
      const nextStimulusDuration =
        overrides?.stimulus_duration ?? parseStimulusDurationInput(advStimulusDuration);
      const nextMaintenanceVolume =
        overrides?.maintenance_volume ?? parseMaintenanceVolumeInput(advMaintenanceVolume);

      if (
        nextDataset === split.dataset &&
        nextCycleLength === (split.cycle_length ?? null) &&
        nextStimulusDuration === (split.stimulus_duration ?? 48) &&
        nextMaintenanceVolume === (split.maintenance_volume ?? 3)
      ) {
        return;
      }

      updateMutation.mutate({
        id,
        data: {
          dataset: nextDataset,
          cycle_length: nextCycleLength,
          stimulus_duration: nextStimulusDuration,
          maintenance_volume: nextMaintenanceVolume,
        },
      });
    },
    [split, id, isEditing, advDataset, advCycleLength, advStimulusDuration, advMaintenanceVolume, updateMutation],
  );

  const handleAdvDatasetChange = useCallback(
    (d: 'schoenfeld' | 'pelland' | 'average') => {
      setAdvDataset(d);
      if (!isEditing) {
        saveAdvancedSettings({ dataset: d });
      }
    },
    [isEditing, saveAdvancedSettings],
  );

  const handleAdvStimulusBlur = useCallback(() => {
    if (isEditing || !split) return;
    // Snap the field to the clamped value so the user sees what will be saved
    // (e.g. "999" -> "96"), then persist only if it actually differs.
    const clamped = parseStimulusDurationInput(advStimulusDuration);
    if (String(clamped) !== advStimulusDuration) setAdvStimulusDuration(String(clamped));
    if (clamped !== (split.stimulus_duration ?? 48)) {
      saveAdvancedSettings({ stimulus_duration: clamped });
    }
  }, [isEditing, split, advStimulusDuration, saveAdvancedSettings]);

  const handleAdvCycleLengthBlur = useCallback(() => {
    if (!isEditing && split) {
      const nextCycleLength = parseCycleLengthInput(advCycleLength) ?? null;
      if (advCycleLength.trim() === '') {
        if ((split.cycle_length ?? null) !== null) {
          saveAdvancedSettings({ cycle_length: null });
        }
        return;
      }
      if (nextCycleLength == null) {
        setAdvCycleLength(split.cycle_length != null ? String(parseCycleLengthInput(split.cycle_length) ?? '') : '');
        return;
      }
      if (String(nextCycleLength) !== advCycleLength) {
        setAdvCycleLength(String(nextCycleLength));
      }
      if (nextCycleLength !== (split.cycle_length ?? null)) {
        saveAdvancedSettings({ cycle_length: nextCycleLength });
      }
    }
  }, [isEditing, split, advCycleLength, saveAdvancedSettings]);

  const handleAdvMaintenanceBlur = useCallback(() => {
    if (isEditing || !split) return;
    const clamped = parseMaintenanceVolumeInput(advMaintenanceVolume);
    if (String(clamped) !== advMaintenanceVolume) setAdvMaintenanceVolume(String(clamped));
    if (clamped !== (split.maintenance_volume ?? 3)) {
      saveAdvancedSettings({ maintenance_volume: clamped });
    }
  }, [isEditing, split, advMaintenanceVolume, saveAdvancedSettings]);

  const handleDuplicate = async () => {
    if (!id) return;
    try {
      const newSplit = await duplicateMutation.mutateAsync(id);
      router.replace(`/(tabs)/splits/${newSplit.id}`);
    } catch (err) {
      Alert.alert('Duplicate failed', getErrorMessage(err));
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      setShowDeleteConfirm(false);
      router.replace('/(tabs)/splits');
    } catch (err) {
      Alert.alert('Delete failed', getErrorMessage(err));
    }
  };

  const updateSession = (sessionId: string | undefined, fallbackIndex: number, session: SessionInput) => {
    const updated = [...editSessions];
    const index = sessionId
      ? updated.findIndex((item) => item.id === sessionId)
      : fallbackIndex;
    if (index < 0 || index >= updated.length) return;
    updated[index] = { ...session, id: updated[index].id };
    setEditSessions(updated);
  };

  const removeSession = (sessionId: string | undefined, fallbackIndex: number) => {
    if (sessionId) {
      setEditSessions(editSessions.filter((item) => item.id !== sessionId));
      return;
    }
    setEditSessions(editSessions.filter((_, i) => i !== fallbackIndex));
  };

  const addSession = () => {
    const day = nextAvailableDay(editSessions);
    if (day == null) {
      Alert.alert('Maximum reached', 'Splits are capped at 7 days.');
      return;
    }
    setEditSessions([
      ...editSessions,
      { id: generateSessionId(), name: '', day, exercises: [{ id: generateExerciseId(), name: '', sets: 3 }] },
    ]);
  };

  const hasActiveWorkout = useWorkoutStore((s) => !!s.activeWorkout);

  const handleStartWorkout = useCallback(
    (session: SessionResponse) => {
      const doStart = () => {
        prefetchPreviousWorkoutData(queryClient, session.name);
        const exercises = session.exercises.map((ex) => ({
          name: ex.exercise_name,
          sets: ex.sets,
          unilateral: ex.unilateral,
          templateExerciseId: ex.id,
        }));
        useWorkoutStore.getState().startWorkoutFromSession(
          session.name,
          exercises,
          undefined, // previousData loaded inside workout screen via store
          session.id,
          split?.id,
        );
        triggerExpandTransition();
      };

      if (hasActiveWorkout) {
        confirm(
          'Replace Workout?',
          'Your current workout will be discarded.',
          'Replace',
          () => {
            useWorkoutStore.getState().cancelWorkout();
            doStart();
          },
        );
        return;
      }
      doStart();
    },
    [hasActiveWorkout, split?.id],
  );

  if (splitLoading) return <Spinner fullScreen />;
  if (!split) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Split not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      {isEditing ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={cancelEdit} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editing</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!dirty || replaceMutation.isPending || updateMutation.isPending || updateExercisesMutation.isPending}
            hitSlop={12}
          >
            {replaceMutation.isPending || updateMutation.isPending || updateExercisesMutation.isPending ? (
              <Spinner />
            ) : (
              <Text style={[styles.saveText, !dirty && styles.saveTextDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/splits')} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {split.name}
            </Text>
            <InfoButton title={HELP_CONTENT['splits.analysisOverview'].title} body={HELP_CONTENT['splits.analysisOverview'].body} />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={enterEditMode} hitSlop={12}>
              <Ionicons name="pencil" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDuplicate} disabled={duplicateMutation.isPending} hitSlop={12}>
              {duplicateMutation.isPending ? (
                <Spinner />
              ) : (
                <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </TouchableOpacity>
            {showDeleteConfirm && (
              <View style={styles.deletePopover}>
                <Text style={styles.deletePopoverText}>Delete split?</Text>
                <View style={styles.deletePopoverActions}>
                  <TouchableOpacity
                    style={styles.deletePopoverCancel}
                    onPress={() => setShowDeleteConfirm(false)}
                    disabled={deleteMutation.isPending}
                  >
                    <Text style={styles.deletePopoverCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deletePopoverConfirm}
                    onPress={confirmDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Spinner />
                    ) : (
                      <Text style={styles.deletePopoverConfirmText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Split / Analysis segmented control */}
      <View style={styles.segmentedRow}>
        <TouchableOpacity
          style={[styles.segmentedBtn, activePage === 0 && styles.segmentedBtnActive]}
          onPress={() => goToPage(0)}
          disabled={isEditing && activePage === 0}
        >
          <Text style={[styles.segmentedText, activePage === 0 && styles.segmentedTextActive]}>
            Split
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentedBtn,
            activePage === 1 && styles.segmentedBtnActive,
            isEditing && styles.segmentedBtnDisabled,
          ]}
          onPress={() => !isEditing && goToPage(1)}
          disabled={isEditing}
        >
          <Text
            style={[
              styles.segmentedText,
              activePage === 1 && styles.segmentedTextActive,
              isEditing && styles.segmentedTextDisabled,
            ]}
          >
            Analysis
          </Text>
        </TouchableOpacity>
      </View>

      {/* Split page (sessions, view or edit) — toggled by the segmented control above */}
      {activePage === 0 ? (
        isEditing ? (
      <ScrollContainerComponent
        ref={scrollRef}
        style={styles.pageScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDraggingExercises && !isDraggingSessions}
      >
        <>
            {/* Edit: Split name */}
            <TextInput
              style={styles.editNameInput}
              placeholder="Split name"
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={styles.restHint}>
              Missing days are rest days. Auto cycle length ends on your last training day; a longer cycle length adds trailing rest days. Use the three-bar handle to reorder sessions.
            </Text>

            {/* Edit: Sessions */}
            {isWeb ? (
              editSessions.map((session, index) => {
                const sessionId = session.id ?? `session_${index}`;
                return (
                  <View
                    key={sessionId}
                    nativeID={`drag-session-${sessionId}`}
                  >
                    <SessionEditorMobile
                      session={session}
                      onUpdate={(nextSession) => updateSession(session.id, index, nextSession)}
                      onRemove={() => removeSession(session.id, index)}
                      canRemove={editSessions.length > 1}
                      simultaneousHandlers={scrollRef}
                      dragSession={() => {
                        setDraggingSessionId(sessionId);
                        handleSessionDragStart();
                      }}
                      isSessionActive={draggingSessionId === sessionId}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  </View>
                );
              })
            ) : (
              <SessionListComponent
                ref={sessionListRef}
                data={editSessions}
                keyExtractor={(item: SessionInput, index: number) => item.id ?? `session_${index}`}
                renderItem={({
                  item,
                  drag,
                  isActive,
                  getIndex,
                }: {
                  item: SessionInput;
                  drag: () => void;
                  isActive: boolean;
                  getIndex: () => number | undefined;
                }) => {
                  const index = getIndex() ?? 0;
                  return (
                    <SessionEditorMobile
                      session={item}
                      onUpdate={(sessionUpdate) => updateSession(item.id, index, sessionUpdate)}
                      onRemove={() => removeSession(item.id, index)}
                      canRemove={editSessions.length > 1}
                      simultaneousHandlers={[scrollRef, sessionListRef]}
                      dragSession={drag}
                      isSessionActive={isActive}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  );
                }}
                onDragBegin={handleSessionDragStart}
                onRelease={handleSessionDragEnd}
                onDragEnd={({ data }: { data: SessionInput[] }) => {
                  const daySlots = [...editSessions]
                    .map((session) => session.day)
                    .sort((a, b) => a - b);
                  const reordered = data.map((session, index) => ({
                    ...session,
                    day: daySlots[index] ?? Math.min(index + 1, 7),
                  }));
                  setEditSessions(reordered);
                  handleSessionDragEnd();
                }}
                scrollEnabled={false}
                activationDistance={14}
                autoscrollThreshold={40}
                autoscrollSpeed={150}
                keyboardShouldPersistTaps="handled"
                simultaneousHandlers={scrollRef}
              />
            )}

            <TouchableOpacity style={styles.addSessionBtn} onPress={addSession}>
              <Ionicons name="add-circle-outline" size={20} color={colors.green} />
              <Text style={styles.addSessionText}>Add Session</Text>
            </TouchableOpacity>
        </>
      </ScrollContainerComponent>
      ) : (
      // View mode uses a plain RN ScrollView. NestableScrollContainer (used in
      // edit mode) is only needed to host the drag-reorder list; using a plain
      // ScrollView here keeps view-mode scrolling simple and consistent with
      // the Analysis page.
      <RNScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <>
            {/* View: Sessions */}
            {split.sessions.map((session) => (
              <Card key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionName}>{session.name}</Text>
                    <Text style={styles.sessionDay}>Day {session.day_number}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.startWorkoutBtn}
                    onPress={() => handleStartWorkout(session)}
                    hitSlop={8}
                  >
                    <Ionicons name="play" size={14} color="#111" />
                  </TouchableOpacity>
                </View>
                {session.exercises.map((ex) => (
                  <View key={ex.id} style={styles.exerciseRow}>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      {ex.unilateral && (
                        <View style={styles.viewUniBadge}>
                          <Text style={styles.viewUniBadgeText}>UNI</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.exerciseSets}>
                      {ex.sets} set{ex.sets !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}
              </Card>
            ))}
        </>
      </RNScrollView>
        )
      ) : (
        /* Analysis page (flattened layout — no more dropdown nesting) */
          <RNScrollView
            style={styles.pageScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <SplitAnalysisPageMobile
              split={split}
              analysis={analysis}
              analysisLoading={analysisLoading}
              analysisError={analysisError}
              advDataset={advDataset}
              advCycleLength={advCycleLength}
              advStimulusDuration={advStimulusDuration}
              advMaintenanceVolume={advMaintenanceVolume}
              onAdvDatasetChange={handleAdvDatasetChange}
              onAdvCycleLengthChange={setAdvCycleLength}
              onAdvCycleLengthBlur={handleAdvCycleLengthBlur}
              onAdvStimulusChange={setAdvStimulusDuration}
              onAdvStimulusBlur={handleAdvStimulusBlur}
              onAdvMaintenanceChange={setAdvMaintenanceVolume}
              onAdvMaintenanceBlur={handleAdvMaintenanceBlur}
              savingAdvSettings={updateMutation.isPending && !isEditing}
            />
          </RNScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 2,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 3,
    position: 'relative',
  },
  deletePopover: {
    position: 'absolute',
    top: 28,
    right: 0,
    width: 180,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    borderRadius: borders.radius.lg,
    backgroundColor: colors.surfaceElevated,
    padding: 10,
    gap: 8,
  },
  deletePopoverText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  deletePopoverActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  deletePopoverCancel: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borders.radius.md,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  deletePopoverCancelText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  deletePopoverConfirm: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borders.radius.md,
    backgroundColor: colors.red,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePopoverConfirmText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  saveText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '700',
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  // Split / Analysis pager
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borders.radius.lg,
    padding: 3,
    gap: 3,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borders.radius.md,
  },
  segmentedBtnActive: {
    backgroundColor: colors.greenMuted,
  },
  segmentedBtnDisabled: {
    opacity: 0.4,
  },
  segmentedText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  segmentedTextActive: {
    color: colors.green,
  },
  segmentedTextDisabled: {
    color: colors.textDim,
  },
  // The active page's scrollable fills the remaining space below the header +
  // segmented control (flex:1), so its content scrolls within that bounded box.
  pageScroll: {
    flex: 1,
  },
  // View mode
  sessionCard: {
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sessionName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionDay: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  exerciseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 14,
  },
  viewUniBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  viewUniBadgeText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
  },
  exerciseSets: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  startWorkoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (analysis-page styles + the obsolete "Detailed Analysis" collapsible
  //  styles now live inside SplitAnalysisPageMobile.)
  // Edit mode
  editNameInput: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 8,
    marginBottom: 20,
  },
  restHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
  },
  addSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    borderRadius: borders.radius.xl,
  },
  addSessionText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
