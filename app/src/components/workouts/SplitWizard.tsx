import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
import type { SessionTemplateResponse, SplitResponse } from '../../api/backend';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import FadeIn from '../../ui/FadeIn';
import Glass from '../../ui/Glass';
import {
  MAX_CYCLE_LENGTH,
  MIN_CYCLE_LENGTH,
  SplitWizardDay,
  WizardWorkout,
  assignWizardWorkout,
  clearWizardDay,
  createSplitWizardDraft,
  moveWizardDay,
  setWizardCycleLength,
  templateToWizardWorkout,
  wizardDraftError,
  wizardDraftToSplitCreate,
  wizardNameError,
  wizardWorkoutsBeyond,
} from '../../workout/splitWizard';
import WorkoutEditor from './WorkoutEditor';

interface SplitWizardProps {
  onCancel: () => void;
  onSaved: (split: SplitResponse) => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

export default function SplitWizard({ onCancel, onSaved }: SplitWizardProps) {
  const account = useAccountState();
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() =>
    createSplitWizardDraft(account.analysisPreferences)
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null);
  // The day-picker modal keeps rendering during its close animation; remember
  // the last day so its content doesn't flash blank while sliding away.
  const lastPickerIndexRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lengthNotice, setLengthNotice] = useState<string | null>(null);

  useEffect(() => {
    if (account.status === 'authenticated') {
      account.ensureWorkoutTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  const changeCycleLength = (delta: number) => {
    const next = draft.cycleLength + delta;
    if (next < MIN_CYCLE_LENGTH || next > MAX_CYCLE_LENGTH) return;
    const dropped = wizardWorkoutsBeyond(draft, next);
    if (dropped.length > 0) {
      setLengthNotice(
        `Day ${draft.cycleLength} has “${dropped[dropped.length - 1].name}” on it. Remove it before shortening the split.`
      );
      return;
    }
    tick();
    setLengthNotice(null);
    setDraft((previous) => setWizardCycleLength(previous, next));
  };

  const placeWorkout = (index: number, workout: WizardWorkout) => {
    setError(null);
    setDraft((previous) => assignWizardWorkout(previous, index, workout));
  };

  const save = async () => {
    if (savingRef.current) return;
    const validation = wizardDraftError(draft);
    if (validation) {
      setError(validation);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await account.createSplit(wizardDraftToSplitCreate(draft));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Split could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (editingDayIndex !== null) {
    const editingDay = draft.days[editingDayIndex];
    const editingExisting = editingDay?.workout ?? null;
    return (
      <WorkoutEditor
        key={`wizard:${editingDay?.key ?? editingDayIndex}`}
        mode="wizard"
        initialWorkout={editingExisting}
        onCancel={() => setEditingDayIndex(null)}
        onSaved={(workout) => {
          placeWorkout(editingDayIndex, workout);
          // A fresh workout also joins the saved-workout library so it can be
          // reused on other days and splits; failure here must not block the
          // wizard, so it is fire-and-forget. Skip when a template already
          // carries the same name — no duplicate library rows.
          const duplicate = account.workoutTemplates.data.some(
            (template) =>
              template.name.trim().toLocaleLowerCase() ===
              workout.name.trim().toLocaleLowerCase()
          );
          if (!editingExisting && !duplicate) {
            account
              .createWorkoutTemplate({
                name: workout.name,
                exercises: workout.exercises.map((exercise, index) => ({
                  exercise_name: exercise.name,
                  sets: exercise.sets,
                  order_index: index,
                  unilateral: Boolean(exercise.unilateral),
                  resistance_profile: exercise.resistance_profile ?? null,
                })),
              })
              .catch(() => {});
          }
          setEditingDayIndex(null);
        }}
        onDelete={
          editingExisting
            ? () => {
                tick();
                setDraft((previous) => clearWizardDay(previous, editingDayIndex));
                setEditingDayIndex(null);
              }
            : undefined
        }
      />
    );
  }

  if (step === 1) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to workout days"
            onPress={() => {
              const validation = wizardNameError(draft);
              if (validation) {
                setError(validation);
                return;
              }
              tick();
              setError(null);
              setStep(2);
            }}
          >
            <Glass style={styles.headerButton} interactive>
              <Text style={styles.headerButtonText}>Next</Text>
            </Glass>
          </Pressable>
        </View>

        <Text style={styles.title}>New Split</Text>
        <Text style={styles.subtitle}>Step 1 of 2 · The basics</Text>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.sectionLabel}>Split name</Text>
          <Glass style={styles.nameField}>
            <TextInput
              accessibilityLabel="Split name"
              value={draft.name}
              onChangeText={(name) => {
                setDraft((previous) => ({ ...previous, name }));
                setError(null);
              }}
              placeholder="Split name"
              placeholderTextColor={theme.textDim}
              maxLength={200}
              autoFocus
              style={styles.input}
            />
          </Glass>

          <Text style={[styles.sectionLabel, styles.repeatLabel]}>
            How often does it repeat?
          </Text>
          <Glass style={styles.repeatCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="One day shorter"
              onPress={() => changeCycleLength(-1)}
              hitSlop={10}
              style={styles.repeatButton}
            >
              <Text style={styles.repeatButtonText}>−</Text>
            </Pressable>
            <View style={styles.repeatValueWrap}>
              <Text style={styles.repeatValue}>{draft.cycleLength}</Text>
              <Text style={styles.repeatUnit}>
                {draft.cycleLength === 1 ? 'day cycle' : 'day cycle'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="One day longer"
              onPress={() => changeCycleLength(1)}
              hitSlop={10}
              style={styles.repeatButton}
            >
              <Text style={styles.repeatButtonText}>+</Text>
            </Pressable>
          </Glass>
          <Text style={styles.repeatHint}>
            Your split starts over every {draft.cycleLength}{' '}
            {draft.cycleLength === 1 ? 'day' : 'days'}. It no longer has to fit a week —
            anything from {MIN_CYCLE_LENGTH} to {MAX_CYCLE_LENGTH} days works.
          </Text>
          {lengthNotice && <Text style={styles.lengthNotice}>{lengthNotice}</Text>}
        </ScrollView>
      </View>
    );
  }

  const renderDay = ({ item, getIndex, drag, isActive }: RenderItemParams<SplitWizardDay>) => {
    const index = getIndex();
    if (index === undefined) return null;
    const workout = item.workout;
    return (
      <ScaleDecorator activeScale={1.02}>
        <Glass
          style={StyleSheet.flatten([styles.dayRow, isActive && styles.dayRowActive])}
          interactive
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              workout ? `Edit ${workout.name} on day ${index + 1}` : `Plan day ${index + 1}`
            }
            onPress={() => {
              tick();
              if (workout) {
                setEditingDayIndex(index);
              } else {
                lastPickerIndexRef.current = index;
                setPickerDayIndex(index);
              }
            }}
            onLongPress={drag}
            delayLongPress={160}
            style={styles.dayMain}
          >
            <Text style={[styles.dragHandleText, isActive && styles.dragHandleActive]}>≡</Text>
            <View style={styles.dayCopy}>
              <View style={styles.dayTitleLine}>
                <Text style={styles.dayLabel}>Day {index + 1}</Text>
                <Text
                  style={[styles.dayName, !workout && styles.dayRest]}
                  numberOfLines={1}
                >
                  {workout ? workout.name : 'Rest'}
                </Text>
              </View>
              <Text style={styles.dayMeta}>
                {workout
                  ? `${workout.exercises.length} ${
                      workout.exercises.length === 1 ? 'exercise' : 'exercises'
                    } · drag to move`
                  : 'Tap to add a workout'}
              </Text>
            </View>
            {workout ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Clear day ${index + 1}`}
                onPress={() => {
                  tick();
                  setDraft((previous) => clearWizardDay(previous, index));
                }}
                hitSlop={10}
                style={styles.clearButton}
              >
                <Text style={styles.clearText}>✕</Text>
              </Pressable>
            ) : (
              <Text style={styles.dayAdd}>+</Text>
            )}
          </Pressable>
        </Glass>
      </ScaleDecorator>
    );
  };

  const displayPickerIndex = pickerDayIndex ?? lastPickerIndexRef.current;
  const pickerDay = draft.days[displayPickerIndex] ?? null;
  const templates = account.workoutTemplates.data;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => {
            tick();
            setError(null);
            setStep(1);
          }}
          hitSlop={12}
          disabled={saving}
        >
          <Text style={styles.cancel}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving}>
          <Glass style={styles.headerButton} interactive>
            <Text style={[styles.headerButtonText, saving && styles.disabled]}>
              {saving ? 'Saving…' : 'Save split'}
            </Text>
          </Glass>
        </Pressable>
      </View>

      <Text style={styles.title}>{draft.name.trim() || 'New Split'}</Text>
      <Text style={styles.subtitle}>
        Step 2 of 2 · {draft.cycleLength}-day cycle
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <DraggableFlatList
        data={draft.days}
        keyExtractor={(day) => day.key}
        renderItem={renderDay}
        onDragEnd={({ from, to }) => {
          if (from === to) return;
          tick();
          setDraft((previous) => moveWizardDay(previous, from, to));
        }}
        activationDistance={8}
        containerStyle={styles.dayListContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <FadeIn>
            <Text style={styles.gridHint}>
              Every day starts as rest. Tap a day to add a workout, then drag days to
              rearrange the cycle.
            </Text>
          </FadeIn>
        }
        contentContainerStyle={styles.content}
      />

      <Modal
        visible={pickerDayIndex !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPickerDayIndex(null)}
      >
        <View style={styles.pickerContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.pickerTitle}>Day {displayPickerIndex + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close day options"
              onPress={() => {
                tick();
                setPickerDayIndex(null);
              }}
              hitSlop={8}
            >
              <Glass style={styles.headerButton} interactive>
                <Text style={styles.headerButtonText}>Cancel</Text>
              </Glass>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new workout for this day"
            onPress={() => {
              if (pickerDayIndex === null) return;
              tick();
              setEditingDayIndex(pickerDayIndex);
              setPickerDayIndex(null);
            }}
          >
            <Glass style={styles.newWorkoutButton} interactive>
              <Text style={styles.newWorkoutText}>+ New workout</Text>
              <Text style={styles.newWorkoutHint}>
                Build this day fresh — it also lands in your saved workouts.
              </Text>
            </Glass>
          </Pressable>

          <Text style={[styles.sectionLabel, styles.reuseLabel]}>
            Or reuse a saved workout
          </Text>
          {templates.length === 0 && (
            <Text style={styles.gridHint}>
              {account.workoutTemplates.loading
                ? 'Loading your saved workouts…'
                : 'Nothing saved yet. New workouts you create will show up here.'}
            </Text>
          )}
          <FlatList
            data={templates}
            keyExtractor={(template) => template.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: SessionTemplateResponse }) => (
              <Glass style={styles.templateRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${item.name}`}
                  onPress={() => {
                    if (pickerDayIndex === null) return;
                    tick();
                    placeWorkout(pickerDayIndex, templateToWizardWorkout(item));
                    setPickerDayIndex(null);
                  }}
                  style={styles.templateMain}
                >
                  <View style={styles.dayCopy}>
                    <Text style={styles.dayName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {item.exercises.length}{' '}
                      {item.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </View>
                  <Text style={styles.dayAdd}>+</Text>
                </Pressable>
              </Glass>
            )}
            contentContainerStyle={styles.content}
          />
          {pickerDay?.workout && (
            <Text style={styles.gridHint}>
              Picking a workout replaces “{pickerDay.workout.name}” on this day.
            </Text>
          )}
        </View>
      </Modal>
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
  headerButton: { borderRadius: 17, paddingVertical: 9, paddingHorizontal: 18 },
  headerButtonText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  subtitle: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
    marginBottom: 20,
  },
  content: { paddingBottom: 40 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 9,
  },
  repeatLabel: { marginTop: 22 },
  nameField: { borderRadius: 16, paddingHorizontal: 14 },
  input: { color: theme.text, fontSize: 15, paddingVertical: 14 },
  repeatCard: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repeatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatButtonText: { color: theme.text, fontSize: 24, lineHeight: 28 },
  repeatValueWrap: { alignItems: 'center' },
  repeatValue: {
    color: theme.text,
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  repeatUnit: { color: theme.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },
  repeatHint: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginTop: 12 },
  lengthNotice: { color: '#E2B778', fontSize: 12, lineHeight: 18, marginTop: 10 },
  gridHint: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  // Bounds the draggable list to the remaining screen height; without this the
  // library's wrapper View overflows and the last day rows can't scroll into view.
  dayListContainer: { flex: 1 },
  dayRow: {
    borderRadius: 18,
    marginBottom: 10,
  },
  dayRowActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.55)',
  },
  dayMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 12,
  },
  dragHandleText: { color: theme.textDim, fontSize: 20, fontWeight: '700' },
  dragHandleActive: { color: theme.accent },
  dayCopy: { flex: 1, marginRight: 8 },
  dayTitleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dayLabel: { color: theme.accent, fontSize: 12, fontWeight: '800' },
  dayName: { color: theme.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  dayRest: { color: theme.textDim, fontWeight: '500' },
  dayMeta: { color: theme.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  dayAdd: { color: theme.accent, fontSize: 20, fontWeight: '600' },
  clearButton: { paddingHorizontal: 4, paddingVertical: 6 },
  clearText: { color: theme.textDim, fontSize: 14 },
  pickerContainer: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  pickerTitle: { color: theme.text, fontSize: 22, fontWeight: '700' },
  newWorkoutButton: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 6,
  },
  newWorkoutText: { color: theme.accent, fontSize: 16, fontWeight: '700' },
  newWorkoutHint: {
    color: theme.textDim,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
    textAlign: 'center',
  },
  reuseLabel: { marginTop: 18 },
  templateRow: {
    borderRadius: 18,
    marginBottom: 10,
  },
  templateMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
});
