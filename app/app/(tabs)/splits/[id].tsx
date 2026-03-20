import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
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
  useReplaceSplit,
  useUpdateSplit,
  useUpdateSplitExercises,
} from '../../../src/hooks/useSplits';
import { getErrorMessage } from '../../../src/api/client';
import { Spinner, Card, InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import AnalysisTabView from '../../../src/components/analysis/AnalysisTabView';
import SessionEditorMobile from '../../../src/components/splits/SessionEditorMobile';
import {
  splitResponseToEditable,
  editableToSplitRequest,
  hasChanges as checkHasChanges,
  generateExerciseId,
  generateSessionId,
  normalizeSessionsForSave,
  parseCycleLengthInput,
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
  const replaceMutation = useReplaceSplit({ invalidateLists: false });
  const updateMutation = useUpdateSplit({ invalidateLists: false });
  const updateExercisesMutation = useUpdateSplitExercises();

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSessions, setEditSessions] = useState<SessionInput[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Collapsible detailed analysis
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [isDraggingExercises, setIsDraggingExercises] = useState(false);
  const [isDraggingSessions, setIsDraggingSessions] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sessionListRef = useRef<any>(null);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setAdvDataset((split.dataset as 'schoenfeld' | 'pelland' | 'average') ?? 'average');
      setAdvCycleLength(split.cycle_length != null ? String(split.cycle_length) : '');
      setAdvStimulusDuration(String(split.stimulus_duration ?? 48));
      setAdvMaintenanceVolume(String(split.maintenance_volume ?? 3));
    }
  }, [split]);

  // Sort muscles for top/bottom stats
  const sortedMuscles = useMemo(() => {
    if (!analysis?.muscles) return [];
    return [...analysis.muscles]
      .filter((m) => m.stimulus > 0)
      .sort((a, b) => b.net_stimulus - a.net_stimulus);
  }, [analysis]);

  const topMuscle = sortedMuscles[0];
  const bottomMuscle = sortedMuscles[sortedMuscles.length - 1];

  const enterEditMode = useCallback(() => {
    if (!split) return;
    const editable = splitResponseToEditable(split);
    setEditName(editable.name);
    setEditSessions(editable.sessions);
    setIsEditing(true);
  }, [split]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    // Revert advanced settings to saved values
    if (split) {
      setAdvDataset((split.dataset as 'schoenfeld' | 'pelland' | 'average') ?? 'average');
      setAdvCycleLength(split.cycle_length != null ? String(split.cycle_length) : '');
      setAdvStimulusDuration(String(split.stimulus_duration ?? 48));
      setAdvMaintenanceVolume(String(split.maintenance_volume ?? 3));
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
      stimulus_duration: parseInt(advStimulusDuration, 10) || 48,
      maintenance_volume: parseInt(advMaintenanceVolume, 10) || 3,
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
      const nextStimulus = parseInt(advStimulusDuration, 10) || 48;
      const nextMaintenance = parseInt(advMaintenanceVolume, 10) || 3;
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
          stimulus_duration: parseInt(advStimulusDuration, 10) || 48,
          maintenance_volume: parseInt(advMaintenanceVolume, 10) || 3,
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
        overrides?.stimulus_duration ?? (parseInt(advStimulusDuration, 10) || 48);
      const nextMaintenanceVolume =
        overrides?.maintenance_volume ?? (parseInt(advMaintenanceVolume, 10) || 3);

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
    if (!isEditing && split && advStimulusDuration !== String(split.stimulus_duration ?? 48)) {
      saveAdvancedSettings({ stimulus_duration: parseInt(advStimulusDuration, 10) || 48 });
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
        setAdvCycleLength(split.cycle_length != null ? String(split.cycle_length) : '');
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
    if (!isEditing && split && advMaintenanceVolume !== String(split.maintenance_volume ?? 3)) {
      saveAdvancedSettings({ maintenance_volume: parseInt(advMaintenanceVolume, 10) || 3 });
    }
  }, [isEditing, split, advMaintenanceVolume, saveAdvancedSettings]);

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

      <ScrollContainerComponent
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDraggingExercises && !isDraggingSessions}
      >
        {isEditing ? (
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
                    onUpdate={(session) => updateSession(item.id, index, session)}
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
                const reordered = data.map((session: SessionInput, index: number) => ({
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

            <TouchableOpacity style={styles.addSessionBtn} onPress={addSession}>
              <Ionicons name="add-circle-outline" size={20} color={colors.green} />
              <Text style={styles.addSessionText}>Add Session</Text>
            </TouchableOpacity>
          </>
        ) : (
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
        )}

        {/* Analysis — always visible below sessions */}
        {analysisLoading ? (
          <Spinner style={styles.analysisSpinner} />
        ) : analysisError ? (
          <Card style={styles.analysisErrorCard}>
            <Text style={styles.analysisErrorTitle}>Analysis unavailable</Text>
            <Text style={styles.analysisErrorBody}>{getErrorMessage(analysisError)}</Text>
            <Text style={styles.analysisErrorHint}>
              If you recently changed auth cookies, log out and sign back in from Settings.
            </Text>
          </Card>
        ) : analysis ? (
          <>
            {/* Summary Stats — 2x2 grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg Stimulus</Text>
                <Text style={[styles.statValue, { color: colors.green }]}>
                  {analysis.summary.avg_net_stimulus.toFixed(1)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Muscles Trained</Text>
                <Text style={[styles.statValue, { color: colors.blue }]}>
                  {analysis.summary.muscles_trained}/{analysis.summary.total_muscles}
                </Text>
              </View>
              {topMuscle && (
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Top Muscle</Text>
                  <Text style={[styles.statValue, { color: '#4ADE80' }]} numberOfLines={1}>
                    {topMuscle.display_name}
                  </Text>
                  <Text style={styles.statSubValue}>{topMuscle.net_stimulus.toFixed(1)}</Text>
                </View>
              )}
              {bottomMuscle && (
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Lowest Trained</Text>
                  <Text style={[styles.statValue, { color: '#EF4444' }]} numberOfLines={1}>
                    {bottomMuscle.display_name}
                  </Text>
                  <Text style={styles.statSubValue}>
                    {bottomMuscle.net_stimulus.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>

            {/* Collapsible Detailed Analysis */}
            <TouchableOpacity
              style={styles.detailedToggle}
              onPress={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
            >
              <Text style={styles.detailedToggleText}>Detailed Analysis</Text>
              <InfoButton title={HELP_CONTENT['splits.detailedAnalysis'].title} body={HELP_CONTENT['splits.detailedAnalysis'].body} />
              <Ionicons
                name={showDetailedAnalysis ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {showDetailedAnalysis && (
              <View style={styles.detailedSection}>
                {/* Advanced Settings — always interactive, auto-save on change */}
                <View style={styles.advancedSection}>
                  <View style={styles.datasetRow}>
                    <Text style={styles.advLabel}>Dataset</Text>
                    <View style={styles.datasetPills}>
                      {(['schoenfeld', 'pelland', 'average'] as const).map((d) => (
                        <TouchableOpacity
                          key={d}
                          style={[styles.pill, advDataset === d && styles.pillActive]}
                          onPress={() => handleAdvDatasetChange(d)}
                        >
                          <Text style={[styles.pillText, advDataset === d && styles.pillTextActive]}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                </View>
                  <View style={styles.advInputRow}>
                    <Text style={styles.advLabel}>Cycle Length (days)</Text>
                    <TextInput
                      style={styles.advTextInput}
                      value={advCycleLength}
                      onChangeText={setAdvCycleLength}
                      onBlur={handleAdvCycleLengthBlur}
                      keyboardType="numeric"
                      placeholder="Auto"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View style={styles.advInputRow}>
                    <Text style={styles.advLabel}>Stimulus Duration (hrs)</Text>
                    <TextInput
                      style={styles.advTextInput}
                      value={advStimulusDuration}
                      onChangeText={setAdvStimulusDuration}
                      onBlur={handleAdvStimulusBlur}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.advInputRow}>
                    <Text style={styles.advLabel}>Maintenance Volume (sets)</Text>
                    <TextInput
                      style={styles.advTextInput}
                      value={advMaintenanceVolume}
                      onChangeText={setAdvMaintenanceVolume}
                      onBlur={handleAdvMaintenanceBlur}
                      keyboardType="numeric"
                    />
                  </View>
                  {updateMutation.isPending && !isEditing && (
                    <View style={styles.savingIndicator}>
                      <Spinner />
                      <Text style={styles.savingText}>Saving...</Text>
                    </View>
                  )}
                </View>

                {/* Groups / Breakdown tabs */}
                <AnalysisTabView splitId={split.id} analysis={analysis} splitData={split} />
              </View>
            )}
          </>
        ) : null}
      </ScrollContainerComponent>

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
  analysisSpinner: {
    marginVertical: 20,
  },
  analysisErrorCard: {
    marginTop: 20,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  analysisErrorTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  analysisErrorBody: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  analysisErrorHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statSubValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  // Detailed analysis collapsible
  detailedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  detailedToggleText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  detailedSection: {
    marginTop: 4,
  },
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
  // Advanced settings (inside detailed analysis, always interactive)
  advancedSection: {
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.md,
  },
  datasetRow: {
    marginBottom: 12,
  },
  advLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  datasetPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borders.radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.greenMuted,
    borderColor: colors.green,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.green,
  },
  advInputRow: {
    marginBottom: 12,
  },
  advTextInput: {
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  savingText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
