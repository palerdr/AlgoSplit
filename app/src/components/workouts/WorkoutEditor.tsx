import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import type {
  SessionResponse,
  SessionTemplateResponse,
  SplitResponse,
} from '../../api/backend';
import { EXERCISES, type Exercise } from '../../data/exercises';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';
import Glass from '../../ui/Glass';
import {
  WorkoutDraft,
  WorkoutDraftExercise,
  newWorkoutDraft,
  parseWorkoutDayInput,
  replaceWorkoutDraftExercise,
  splitDayLimit,
  workoutDraftError,
  workoutDraftFromSession,
  workoutDraftFromTemplate,
  workoutDraftFromWizard,
  workoutDraftToSessionCreate,
  workoutDraftToTemplateCreate,
} from '../../workout/splitEditing';
import type { WizardWorkout } from '../../workout/splitWizard';

/**
 * One editor, three destinations:
 * - 'session': a day inside a saved split (persists via the splits API; has a Day field)
 * - 'template': a standalone saved workout (persists via the session-templates API)
 * - 'wizard': an in-memory workout being placed on a split-wizard day (no API call)
 */
type WorkoutEditorTarget =
  | {
      mode: 'session';
      split: SplitResponse;
      session?: SessionResponse;
      initialDay?: number;
      onSaved: (split: SplitResponse) => void;
    }
  | {
      mode: 'template';
      template: SessionTemplateResponse | null;
      onSaved: (template: SessionTemplateResponse) => void;
    }
  | {
      mode: 'wizard';
      initialWorkout: WizardWorkout | null;
      onSaved: (workout: WizardWorkout) => void;
    };

type WorkoutEditorProps = WorkoutEditorTarget & {
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
};

const tick = () => Haptics.selectionAsync().catch(() => {});
const RESISTANCE_PROFILES = [
  { value: 'ascending', label: 'Asc' },
  { value: 'mid', label: 'Mid' },
  { value: 'descending', label: 'Desc' },
] as const;
const ROW_SEARCH_RESULT_LIMIT = 6;
const CATALOG_RESULT_LIMIT = 50;

function searchExerciseCatalog(query: string, currentName?: string, limit = CATALOG_RESULT_LIMIT) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  const normalizedCurrentName = currentName?.toLocaleLowerCase();
  return EXERCISES.filter(
    (exercise) =>
      exercise.name.toLocaleLowerCase().includes(normalizedQuery) &&
      exercise.name.toLocaleLowerCase() !== normalizedCurrentName
  ).slice(0, limit);
}

export default function WorkoutEditor(props: WorkoutEditorProps) {
  const { onCancel, onDelete } = props;
  const account = useAccountState();
  const nextKey = useRef(0);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState<WorkoutDraft>(() => {
    if (props.mode === 'session') {
      return props.session
        ? workoutDraftFromSession(props.split.id, props.session)
        : newWorkoutDraft(props.split, props.initialDay);
    }
    if (props.mode === 'template') return workoutDraftFromTemplate(props.template);
    return workoutDraftFromWizard(props.initialWorkout);
  });
  const [dayText, setDayText] = useState(() => String(draft.dayNumber));
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState<{ key: string; query: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingExisting =
    props.mode === 'session'
      ? Boolean(props.session)
      : props.mode === 'template'
        ? Boolean(props.template)
        : Boolean(props.initialWorkout);
  const subtitle =
    props.mode === 'session'
      ? props.split.name
      : props.mode === 'template'
        ? 'Saved workout'
        : 'For this split';

  // The empty-query "recents" rail needs logged-workout names; only Details
  // screens load summaries otherwise.
  useEffect(() => {
    if (account.status === 'authenticated') {
      account.ensureWorkoutSummaries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  const catalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      const recentNames = account.workoutSummaries.data.workouts
        .flatMap((workout) => workout.exercise_names)
        .concat(
          account.workoutTemplates.data.flatMap((template) =>
            template.exercises.map((exercise) => exercise.exercise_name)
          )
        )
        .concat(
          account.splits.data.flatMap((savedSplit) =>
            savedSplit.sessions.flatMap((savedSession) =>
              savedSession.exercises.map((exercise) => exercise.exercise_name)
            )
          )
        );
      const byName = new Map(EXERCISES.map((exercise) => [exercise.name.toLocaleLowerCase(), exercise]));
      const seen = new Set<string>();
      return recentNames
        .map((name) => byName.get(name.toLocaleLowerCase()))
        .filter((exercise): exercise is Exercise => {
          if (!exercise || seen.has(exercise.id)) return false;
          seen.add(exercise.id);
          return true;
        })
        .slice(0, 20);
    }
    return EXERCISES.filter((exercise) =>
      exercise.name.toLocaleLowerCase().includes(query)
    ).slice(0, CATALOG_RESULT_LIMIT);
  }, [
    account.splits.data,
    account.workoutSummaries.data.workouts,
    account.workoutTemplates.data,
    search,
  ]);

  const pickedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exercise of draft.exercises) {
      const key = exercise.name.toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [draft.exercises]);

  const updateExercise = (index: number, update: Partial<WorkoutDraftExercise>) => {
    setDraft((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, ...update } : exercise
      ),
    }));
  };

  const addExercise = (exercise: Exercise) => {
    tick();
    nextKey.current += 1;
    setError(null);
    setDraft((previous) => ({
      ...previous,
      exercises: [
        ...previous.exercises,
        {
          key: `new:${exercise.id}:${nextKey.current}`,
          name: exercise.name,
          sets: 3,
          unilateral: exercise.unilateral,
          resistanceProfile: 'mid',
        },
      ],
    }));
  };

  const replaceExercise = (exerciseKey: string, replacement: Exercise) => {
    tick();
    setDraft((previous) => ({
      ...previous,
      exercises: replaceWorkoutDraftExercise(previous.exercises, exerciseKey, replacement),
    }));
    setExerciseSearch(null);
  };

  const renderPickedExercise = ({
    item: exercise,
    getIndex,
    drag,
    isActive,
  }: RenderItemParams<WorkoutDraftExercise>) => {
    const index = getIndex();
    if (index === undefined) return null;
    const rowSearch = exerciseSearch?.key === exercise.key ? exerciseSearch : null;
    const replacementMatches = rowSearch
      ? searchExerciseCatalog(rowSearch.query, exercise.name, ROW_SEARCH_RESULT_LIMIT)
      : [];
    return (
      <ScaleDecorator activeScale={1.02}>
        <View style={[styles.pickedRow, isActive && styles.pickedRowActive]}>
          <View style={styles.pickedMainRow}>
            <Pressable
              accessibilityLabel={`Reorder ${exercise.name}`}
              accessibilityHint="Press and drag to move this exercise"
              onPressIn={drag}
              hitSlop={8}
              style={styles.dragHandle}
            >
              <Text style={[styles.dragHandleText, isActive && styles.dragHandleActive]}>≡</Text>
            </Pressable>
            <View style={styles.pickedNameField}>
              <TextInput
                accessibilityLabel={`Replace ${exercise.name}`}
                value={rowSearch?.query ?? exercise.name}
                onFocus={() => setExerciseSearch({ key: exercise.key, query: exercise.name })}
                onChangeText={(query) => setExerciseSearch({ key: exercise.key, query })}
                onSubmitEditing={() => {
                  if (replacementMatches[0]) replaceExercise(exercise.key, replacementMatches[0]);
                }}
                placeholder="Search replacement"
                placeholderTextColor={theme.textDim}
                autoCorrect={false}
                selectTextOnFocus
                returnKeyType="search"
                style={styles.pickedNameInput}
              />
              <Text style={styles.pickedSearchIcon}>⌕</Text>
            </View>
            <View style={styles.setControls}>
              <Pressable
                onPress={() => {
                  tick();
                  updateExercise(index, { sets: Math.max(1, exercise.sets - 1) });
                }}
                hitSlop={7}
              >
                <Text style={styles.setButton}>−</Text>
              </Pressable>
              <Text style={styles.setValue}>{exercise.sets}×</Text>
              <Pressable
                onPress={() => {
                  tick();
                  updateExercise(index, { sets: Math.min(20, exercise.sets + 1) });
                }}
                hitSlop={7}
              >
                <Text style={styles.setButton}>+</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                tick();
                setDraft((previous) => ({
                  ...previous,
                  exercises: previous.exercises.filter(
                    (candidate) => candidate.key !== exercise.key
                  ),
                }));
              }}
              hitSlop={8}
            >
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
          {rowSearch && rowSearch.query.trim() !== exercise.name.trim() && (
            <View style={styles.replacementResults}>
              {replacementMatches.map((replacement) => (
                <Pressable
                  key={replacement.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace with ${replacement.name}`}
                  onPress={() => replaceExercise(exercise.key, replacement)}
                  style={styles.replacementRow}
                >
                  <Text style={styles.replacementName}>{replacement.name}</Text>
                  <Text style={styles.replacementAction}>Swap</Text>
                </Pressable>
              ))}
              {replacementMatches.length === 0 && (
                <Text style={styles.noReplacement}>No matching exercises</Text>
              )}
            </View>
          )}
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Resistance</Text>
            <View style={styles.profileOptions}>
              {RESISTANCE_PROFILES.map((profile) => {
                const active = exercise.resistanceProfile === profile.value;
                return (
                  <Pressable
                    key={profile.value}
                    accessibilityRole="button"
                    accessibilityLabel={`${profile.label} resistance profile`}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      tick();
                      updateExercise(index, { resistanceProfile: profile.value });
                    }}
                    style={[styles.profilePill, active && styles.profilePillActive]}
                  >
                    <Text style={[styles.profileText, active && styles.profileTextActive]}>
                      {profile.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ScaleDecorator>
    );
  };

  const save = async () => {
    if (savingRef.current) return;
    const validation = workoutDraftError(
      props.mode === 'session' ? props.split : null,
      draft
    );
    if (validation) {
      setError(validation);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (props.mode === 'wizard') {
        const session = workoutDraftToSessionCreate(draft);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        props.onSaved({ name: session.name, exercises: session.exercises });
        return;
      }
      if (props.mode === 'template') {
        const payload = workoutDraftToTemplateCreate(draft);
        const saved = props.template
          ? await account.updateWorkoutTemplate(props.template.id, payload)
          : await account.createWorkoutTemplate(payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        props.onSaved(saved);
        return;
      }
      const saved = await account.saveSplitSession(
        props.split.id,
        draft.sessionId,
        workoutDraftToSessionCreate(draft)
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      props.onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workout could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workout could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onCancel} hitSlop={12} disabled={saving || deleting}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <View style={styles.headerActions}>
          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${draft.name || 'workout'}`}
              onPress={() => {
                tick();
                setError(null);
                setDeleteConfirmOpen(true);
              }}
              disabled={saving || deleting}
            >
              <Glass style={styles.deleteButton} interactive>
                <Text style={styles.deleteText}>Delete</Text>
              </Glass>
            </Pressable>
          )}
          <Pressable onPress={save} disabled={saving || deleting}>
            <Glass style={styles.saveButton} interactive>
              <Text style={[styles.saveText, (saving || deleting) && styles.disabled]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Glass>
          </Pressable>
        </View>
      </View>

      <Text style={styles.title}>{editingExisting ? 'Edit Workout' : 'New Workout'}</Text>
      <Text style={styles.splitName}>{subtitle}</Text>

      <DraggableFlatList
        data={draft.exercises}
        keyExtractor={(exercise) => exercise.key}
        renderItem={renderPickedExercise}
        extraData={exerciseSearch}
        onDragBegin={() => setExerciseSearch(null)}
        onDragEnd={({ data, from, to }) => {
          if (from === to) return;
          tick();
          setDraft((previous) => ({
            ...previous,
            exercises: data,
          }));
        }}
        activationDistance={8}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        containerStyle={styles.editorList}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.fieldRow}>
              <Glass style={styles.nameField}>
                <TextInput
                  accessibilityLabel="Workout name"
                  value={draft.name}
                  onChangeText={(name) => setDraft((previous) => ({ ...previous, name }))}
                  placeholder="Workout name"
                  placeholderTextColor={theme.textDim}
                  maxLength={200}
                  style={styles.input}
                />
              </Glass>
              {props.mode === 'session' && (
                <Glass style={styles.dayField}>
                  <Text style={styles.dayPrefix}>Day</Text>
                  <TextInput
                    accessibilityLabel="Workout day"
                    value={dayText}
                    onChangeText={(value) => {
                      const parsed = parseWorkoutDayInput(value);
                      setDayText(parsed.text);
                      setDraft((previous) => ({
                        ...previous,
                        dayNumber: parsed.dayNumber,
                      }));
                    }}
                    keyboardType="number-pad"
                    maxLength={splitDayLimit(props.split) > 9 ? 2 : 1}
                    selectTextOnFocus
                    style={styles.dayInput}
                  />
                </Glass>
              )}
            </View>

            <Text style={styles.sectionLabel}>Exercises</Text>
            {draft.exercises.length === 0 && (
              <Text style={styles.catalogHint}>
                No exercises yet. Every workout needs at least one.
              </Text>
            )}
          </>
        }
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercises"
            onPress={() => {
              tick();
              setExerciseSearch(null);
              setPickerOpen(true);
            }}
          >
            <Glass style={styles.addButton} interactive>
              <Text style={styles.addButtonText}>+ Add exercises</Text>
            </Glass>
          </Pressable>
        }
      />

      <Modal
        visible={pickerOpen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.pickerContainer}
        >
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Add exercises</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done adding exercises"
              onPress={() => {
                tick();
                setSearch('');
                setPickerOpen(false);
              }}
              hitSlop={8}
            >
              <Glass style={styles.pickerDone} interactive>
                <Text style={styles.pickerDoneText}>Done</Text>
              </Glass>
            </Pressable>
          </View>
          <Glass style={styles.searchField}>
            <TextInput
              accessibilityLabel="Search exercises"
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises"
              placeholderTextColor={theme.textDim}
              autoCorrect={false}
              autoFocus
              style={styles.input}
            />
          </Glass>
          {!search.trim() && (
            <Text style={styles.pickerSectionLabel}>
              {catalog.length > 0 ? 'Recent' : 'Search the catalog to add your first movement.'}
            </Text>
          )}
          <FlatList
            data={catalog}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={5}
            renderItem={({ item }) => {
              const added = pickedCounts.get(item.name.toLocaleLowerCase()) ?? 0;
              return (
                <Pressable style={styles.catalogRow} onPress={() => addExercise(item)}>
                  <Text style={styles.catalogName}>{item.name}</Text>
                  <View style={styles.catalogRight}>
                    {added > 0 && (
                      <Text style={styles.catalogAdded}>
                        {added === 1 ? 'Added' : `Added ×${added}`}
                      </Text>
                    )}
                    <Text style={styles.catalogAdd}>+</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </KeyboardAvoidingView>
      </Modal>

      <DeleteConfirmationModal
        visible={deleteConfirmOpen}
        title="Delete workout?"
        message={`“${draft.name || 'This workout'}” will be permanently deleted.`}
        busy={deleting}
        error={deleteConfirmOpen ? error : null}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setError(null);
        }}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cancel: { color: theme.textDim, fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButton: { borderRadius: 17, paddingVertical: 9, paddingHorizontal: 14 },
  deleteText: { color: '#E27878', fontSize: 13, fontWeight: '700' },
  saveButton: { borderRadius: 17, paddingVertical: 9, paddingHorizontal: 18 },
  saveText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  splitName: { color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 5, marginBottom: 20 },
  editorList: { flex: 1 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  fieldRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  nameField: { flex: 1, borderRadius: 16, paddingHorizontal: 14 },
  dayField: {
    width: 88,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayPrefix: { color: theme.textDim, fontSize: 12, marginRight: 6 },
  dayInput: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1, paddingVertical: 14 },
  input: { color: theme.text, fontSize: 15, paddingVertical: 14 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 9,
  },
  pickedRow: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
  },
  pickedMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickedRowActive: {
    backgroundColor: 'rgba(65,196,110,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.55)',
  },
  dragHandle: { paddingHorizontal: 2, paddingVertical: 7 },
  dragHandleText: { color: theme.textDim, fontSize: 22, lineHeight: 17, fontWeight: '700' },
  dragHandleActive: { color: theme.accent },
  pickedNameField: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pickedNameInput: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 14,
    lineHeight: 19,
    paddingVertical: 7,
  },
  pickedSearchIcon: { color: theme.textDim, fontSize: 16, marginLeft: 5 },
  setControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  setButton: { color: theme.text, fontSize: 18, width: 18, textAlign: 'center' },
  setValue: { color: theme.text, fontSize: 13, minWidth: 26, textAlign: 'center' },
  remove: { color: theme.textDim, fontSize: 14 },
  replacementResults: {
    marginTop: 7,
    marginLeft: 34,
    borderRadius: 11,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(12,18,14,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  replacementRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  replacementName: { flex: 1, color: theme.text, fontSize: 13 },
  replacementAction: { color: theme.accent, fontSize: 11, fontWeight: '700' },
  noReplacement: { color: theme.textDim, fontSize: 12, paddingVertical: 12 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginLeft: 34,
    gap: 10,
  },
  profileLabel: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  profileOptions: { flexDirection: 'row', gap: 5 },
  profilePill: {
    minWidth: 32,
    alignItems: 'center',
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  profilePillActive: { backgroundColor: 'rgba(65,196,110,0.18)' },
  profileText: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  profileTextActive: { color: theme.accent },
  addButton: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  addButtonText: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  pickerContainer: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pickerTitle: { color: theme.text, fontSize: 22, fontWeight: '700' },
  pickerDone: { borderRadius: 17, paddingVertical: 8, paddingHorizontal: 16 },
  pickerDoneText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  pickerSectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 4,
  },
  searchField: { borderRadius: 16, paddingHorizontal: 14 },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  catalogName: { color: theme.text, fontSize: 15, flex: 1, marginRight: 12 },
  catalogRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catalogAdded: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  catalogAdd: { color: theme.accent, fontSize: 20, fontWeight: '600' },
  catalogHint: { color: theme.textDim, fontSize: 12, lineHeight: 17, paddingVertical: 12 },
  listContent: { paddingBottom: 40 },
});
