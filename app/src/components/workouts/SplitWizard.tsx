import React, { useEffect, useRef, useState } from 'react';
import {
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
import type { AnalysisResponse, SplitResponse } from '../../api/backend';
import { analysis as analysisApi } from '../../api/backend';
import { getStimulusLevel, stimulusScore } from '../../analysis/stimulus';
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
  sessionToWizardWorkout,
  setWizardCycleLength,
  templateToWizardWorkout,
  wizardDraftError,
  wizardDraftToAnalysisRequest,
  wizardDraftToSplitCreate,
  wizardNameError,
  wizardWorkoutsBeyond,
} from '../../workout/splitWizard';
import WorkoutEditor from './WorkoutEditor';

interface SplitWizardProps {
  onCancel: () => void;
  onSaved: (split: SplitResponse, setAsActive: boolean) => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

type WizardStep = 1 | 2 | 3;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Split basics',
  2: 'Workout days',
  3: 'Stimulus review',
};

function stimulusBarColor(level: number): string {
  if (level <= 0) return 'rgba(255,255,255,0.07)';
  if (level <= 2) return theme.accentDeep;
  if (level <= 5) return '#23A24A';
  return theme.accent;
}

/** Progress bar under the title, mirroring the session screen's set segments. */
function StepBar({
  step,
  onStepPress,
}: {
  step: WizardStep;
  onStepPress: (step: WizardStep) => void;
}) {
  return (
    <View style={styles.stepBar}>
      {([1, 2, 3] as const).map((target) => (
        <Pressable
          key={target}
          accessibilityRole="button"
          accessibilityLabel={STEP_LABELS[target]}
          onPress={() => onStepPress(target)}
          hitSlop={10}
          style={styles.stepSegment}
        >
          {step >= target && <View style={[styles.stepFill, { width: '100%' }]} />}
        </Pressable>
      ))}
    </View>
  );
}

export default function SplitWizard({ onCancel, onSaved }: SplitWizardProps) {
  const account = useAccountState();
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() =>
    createSplitWizardDraft(account.analysisPreferences)
  );
  const [step, setStep] = useState<WizardStep>(1);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null);
  const [setAsActive, setSetAsActive] = useState(true);
  const [analysisState, setAnalysisState] = useState<{
    data: AnalysisResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });
  const analysisKeyRef = useRef<string | null>(null);
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

  const runAnalysis = (force = false) => {
    const request = wizardDraftToAnalysisRequest(draft);
    const key = JSON.stringify(request);
    if (!force && analysisKeyRef.current === key && (analysisState.data || analysisState.loading)) {
      return;
    }
    analysisKeyRef.current = key;
    setAnalysisState({ data: null, loading: true, error: null });
    analysisApi
      .analyzeSplit(request)
      .then((data) => {
        if (analysisKeyRef.current !== key) return;
        setAnalysisState({ data, loading: false, error: null });
      })
      .catch((cause) => {
        if (analysisKeyRef.current !== key) return;
        setAnalysisState({
          data: null,
          loading: false,
          error: cause instanceof Error ? cause.message : 'Analysis failed.',
        });
      });
  };

  const goToStep = (next: WizardStep) => {
    if (next === step) return;
    if (next >= 2) {
      const validation = wizardNameError(draft);
      if (validation) {
        setError(validation);
        return;
      }
    }
    if (next === 3) {
      const validation = wizardDraftError(draft);
      if (validation) {
        setError(validation);
        return;
      }
      runAnalysis();
    }
    tick();
    setError(null);
    setStep(next);
  };

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
      if (setAsActive) account.setActiveSplit(saved.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(saved, setAsActive);
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
            onPress={() => goToStep(2)}
          >
            <Glass style={styles.headerButton} interactive>
              <Text style={styles.headerButtonText}>Next</Text>
            </Glass>
          </Pressable>
        </View>

        <Text style={styles.title}>New Split</Text>
        <StepBar step={1} onStepPress={goToStep} />

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
          {lengthNotice && <Text style={styles.lengthNotice}>{lengthNotice}</Text>}
        </ScrollView>
      </View>
    );
  }

  if (step === 3) {
    const muscles = analysisState.data?.muscles ?? [];
    const rows = [...muscles]
      .map((muscle) => ({
        region: muscle.region_id,
        name: muscle.display_name,
        net: muscle.net_stimulus,
      }))
      .sort((a, b) => b.net - a.net);
    const maxNet = Math.max(0.1, ...rows.map((row) => Math.max(0, row.net)));
    const score = analysisState.data ? stimulusScore(analysisState.data.muscles) : null;
    const totalNet = rows.reduce((sum, row) => sum + Math.max(0, row.net), 0);

    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => goToStep(2)} hitSlop={12} disabled={saving}>
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
        <StepBar step={3} onStepPress={goToStep} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {error && <Text style={styles.error}>{error}</Text>}

          <Glass style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>Weekly stimulus</Text>
              {score !== null && (
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreValue}>{score}</Text>
                  <Text style={styles.scoreLabel}>score</Text>
                </View>
              )}
            </View>
            {analysisState.loading && (
              <Text style={styles.gridHint}>Analyzing your split…</Text>
            )}
            {analysisState.error && (
              <Pressable onPress={() => runAnalysis(true)}>
                <Text style={styles.error}>
                  Analysis failed — tap to retry. You can still save the split.
                </Text>
              </Pressable>
            )}
            {analysisState.data && (
              <>
                <Text style={styles.reviewTotal}>
                  {totalNet.toFixed(1)} total net stimulus ·{' '}
                  {rows.filter((row) => row.net > 0).length} muscles trained
                </Text>
                {rows.map((row, index) => {
                  const level = getStimulusLevel(row.net);
                  return (
                    <View
                      key={row.region}
                      style={[styles.muscleRow, index > 0 && styles.muscleRowBorder]}
                    >
                      <Text style={styles.muscleName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <View style={styles.muscleTrack}>
                        <View
                          style={[
                            styles.muscleFill,
                            {
                              width: `${(Math.max(0, row.net) / maxNet) * 100}%`,
                              backgroundColor: stimulusBarColor(level),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.muscleNet}>{row.net.toFixed(1)}</Text>
                    </View>
                  );
                })}
              </>
            )}
          </Glass>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: setAsActive }}
            accessibilityLabel="Set as active split"
            onPress={() => {
              tick();
              setSetAsActive((value) => !value);
            }}
          >
            <Glass style={styles.activeToggle} interactive>
              <View style={styles.activeToggleCopy}>
                <Text style={styles.activeToggleTitle}>Set as active split</Text>
                <Text style={styles.gridHintTight}>
                  Shows on your home screen with a streak and one-tap start.
                </Text>
              </View>
              <View style={[styles.checkbox, setAsActive && styles.checkboxOn]}>
                {setAsActive && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
            </Glass>
          </Pressable>
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
  const splitDayOptions = account.splits.data.flatMap((split) =>
    split.sessions
      .filter((session) => session.exercises.length > 0)
      .map((session) => ({ splitName: split.name, session }))
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => goToStep(1)} hitSlop={12} disabled={saving}>
          <Text style={styles.cancel}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={() => goToStep(3)} disabled={saving}>
          <Glass style={styles.headerButton} interactive>
            <Text style={styles.headerButtonText}>Next</Text>
          </Glass>
        </Pressable>
      </View>

      <Text style={styles.title}>{draft.name.trim() || 'New Split'}</Text>
      <StepBar step={2} onStepPress={goToStep} />

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

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
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
            {templates.map((template) => (
              <Glass key={template.id} style={styles.templateRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${template.name}`}
                  onPress={() => {
                    if (pickerDayIndex === null) return;
                    tick();
                    placeWorkout(pickerDayIndex, templateToWizardWorkout(template));
                    setPickerDayIndex(null);
                  }}
                  style={styles.templateMain}
                >
                  <View style={styles.dayCopy}>
                    <Text style={styles.dayName} numberOfLines={1}>
                      {template.name}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {template.exercises.length}{' '}
                      {template.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </View>
                  <Text style={styles.dayAdd}>+</Text>
                </Pressable>
              </Glass>
            ))}

            {splitDayOptions.length > 0 && (
              <Text style={[styles.sectionLabel, styles.reuseLabel]}>
                From your splits
              </Text>
            )}
            {splitDayOptions.map(({ splitName, session }) => (
              <Glass key={session.id} style={styles.templateRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${session.name} from ${splitName}`}
                  onPress={() => {
                    if (pickerDayIndex === null) return;
                    tick();
                    placeWorkout(pickerDayIndex, sessionToWizardWorkout(session));
                    setPickerDayIndex(null);
                  }}
                  style={styles.templateMain}
                >
                  <View style={styles.dayCopy}>
                    <Text style={styles.dayName} numberOfLines={1}>
                      {session.name}
                    </Text>
                    <Text style={styles.dayMeta} numberOfLines={1}>
                      {splitName} · {session.exercises.length}{' '}
                      {session.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </View>
                  <Text style={styles.dayAdd}>+</Text>
                </Pressable>
              </Glass>
            ))}

            {pickerDay?.workout && (
              <Text style={styles.gridHint}>
                Picking a workout replaces “{pickerDay.workout.name}” on this day.
              </Text>
            )}
          </ScrollView>
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
  stepBar: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 12,
    marginBottom: 20,
  },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  stepFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.accent,
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
  lengthNotice: { color: '#E2B778', fontSize: 12, lineHeight: 18, marginTop: 10 },
  gridHint: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  gridHintTight: { color: theme.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  reviewCard: { borderRadius: 20, padding: 18, marginBottom: 14 },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  scoreBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  scoreValue: {
    color: theme.accent,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  reviewTotal: { color: theme.textDim, fontSize: 12, marginBottom: 10 },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
  },
  muscleRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  muscleName: { color: theme.text, fontSize: 12.5, width: 108 },
  muscleTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  muscleFill: { height: '100%', borderRadius: 3 },
  muscleNet: {
    color: theme.textDim,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 32,
    textAlign: 'right',
  },
  activeToggle: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeToggleCopy: { flex: 1 },
  activeToggleTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: theme.accent,
    backgroundColor: 'rgba(65,196,110,0.18)',
  },
  checkboxMark: { color: theme.accent, fontSize: 15, fontWeight: '800' },
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
