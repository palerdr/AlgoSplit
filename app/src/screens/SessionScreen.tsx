import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccountState } from '../state/AccountState';
import { EXERCISES } from '../data/exercises';
import { useAppState, ActiveSession, SetRecord } from '../state/AppState';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import {
  PreviousExerciseData,
  previousLocalExercise,
  previousRemoteExercise,
  validateSetDraft,
} from '../workout/logging';
import RestTimer from './RestTimer';

// Real SF Symbols pencil on iOS; falls back to a text glyph elsewhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SymbolView: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SymbolView = require('expo-symbols').SymbolView;
} catch {
  SymbolView = null;
}

interface SessionScreenProps {
  onComplete: () => void;
  onDiscard: () => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

function EntryField({
  label,
  value,
  shadow,
  error,
  onChangeText,
  onBlur,
  decimal = false,
}: {
  label: string;
  value: string;
  shadow?: number;
  error?: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  decimal?: boolean;
}) {
  return (
    <View style={styles.entryColumn}>
      <Text style={styles.entryLabel}>{label}</Text>
      <Glass style={[styles.entryGlass, error ? styles.entryGlassError : undefined]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder={shadow == null ? '—' : String(shadow)}
          placeholderTextColor={theme.textDim}
          selectTextOnFocus
          style={styles.entryInput}
        />
      </Glass>
    </View>
  );
}

// ── Slide-to-complete: layered liquid glass, power-off feel ──────
// One shared 0..1 value (`frac`) drives the thumb, the track charge AND the
// live segment in the top progress bar.
const TRACK_H = 74;
const TRACK_PAD = 7;
const THUMB = TRACK_H - TRACK_PAD * 2;

function SlideToComplete({
  frac,
  onComplete,
  resetKey,
}: {
  frac: Animated.Value;
  onComplete: () => void;
  resetKey: string;
}) {
  const [trackW, setTrackW] = useState(0);
  const maxX = Math.max(1, trackW - THUMB - TRACK_PAD * 2);
  const maxXRef = useRef(1);
  maxXRef.current = maxX;

  const doneRef = useRef(false);
  const armedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // New set → thumb back to the start.
  useEffect(() => {
    doneRef.current = false;
    armedRef.current = false;
    frac.setValue(0);
  }, [resetKey, frac]);

  // Soft breathing on the chevron — the only motion at rest.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3,
      onPanResponderMove: (_, g) => {
        if (doneRef.current) return;
        const nx = Math.min(Math.max(g.dx, 0), maxXRef.current);
        frac.setValue(nx / maxXRef.current);
        const armed = nx > maxXRef.current * 0.9;
        if (armed !== armedRef.current) {
          armedRef.current = armed;
          tick();
        }
      },
      onPanResponderRelease: (_, g) => {
        if (doneRef.current) return;
        if (g.dx >= maxXRef.current * 0.9) {
          doneRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          Animated.timing(frac, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }).start(() => onCompleteRef.current());
        } else {
          Animated.spring(frac, {
            toValue: 0,
            stiffness: 300,
            damping: 21,
            mass: 0.8,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (doneRef.current) return;
        Animated.spring(frac, { toValue: 0, stiffness: 300, damping: 21, mass: 0.8, useNativeDriver: false }).start();
      },
    })
  ).current;

  const translateX = frac.interpolate({ inputRange: [0, 1], outputRange: [0, maxX] });

  return (
    <View onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      <Glass style={styles.sliderTrack}>
        {/* green charge sweeping with the thumb */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sliderCharge,
            {
              width: frac.interpolate({
                inputRange: [0, 1],
                outputRange: [THUMB + TRACK_PAD * 2, Math.max(THUMB + TRACK_PAD * 2, trackW)],
              }),
              opacity: frac.interpolate({
                inputRange: [0.02, 0.5],
                outputRange: [0, 0.32],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
        <Animated.Text
          style={[
            styles.sliderLabel,
            {
              opacity: frac.interpolate({
                inputRange: [0, 0.55],
                outputRange: [0.8, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          slide to complete
        </Animated.Text>
      </Glass>
      {/* Liquid glass thumb — a SIBLING of the track glass (nesting glass
          inside glass renders unreliably), floating above it. */}
      <Animated.View
        style={[styles.thumbWrap, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <Glass style={styles.thumbGlass} interactive>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumbCharge,
              {
                opacity: frac.interpolate({
                  inputRange: [0.75, 1],
                  outputRange: [0, 0.5],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
          <Animated.Text
            style={[
              styles.thumbChevron,
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
            ]}
          >
            ❯
          </Animated.Text>
        </Glass>
      </Animated.View>
    </View>
  );
}

// ── Per-set progress segment ──────────────────────────────────────
function SetSegment({
  status,
  liveFrac,
}: {
  status: 'done' | 'current' | 'todo';
  liveFrac: Animated.Value;
}) {
  return (
    <View style={styles.segmentTrack}>
      {status === 'done' && <View style={[styles.segmentFill, { width: '100%' }]} />}
      {status === 'current' && (
        <Animated.View
          style={[
            styles.segmentFill,
            {
              width: liveFrac.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      )}
    </View>
  );
}

// ── Session screen ────────────────────────────────────────────────
export default function SessionScreen({ onComplete, onDiscard }: SessionScreenProps) {
  const {
    history,
    session,
    completeSet,
    finishSession,
    addExercise,
    editExercise,
    updateExerciseNotes,
    discardSession,
  } = useAppState();
  const account = useAccountState();
  const [resting, setResting] = useState(false);
  const [picker, setPicker] = useState<'add' | 'edit' | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Shared slide progress: drives the slider AND the live top-bar segment.
  const slideFrac = useRef(new Animated.Value(0)).current;

  // Finishing/discarding nulls the session while the nav fade is still
  // transparent — keep rendering the last snapshot so the screen doesn't
  // blank out mid-fade. Actions no-op safely against the null session.
  const lastSessionRef = useRef<ActiveSession | null>(null);
  if (session) lastSessionRef.current = session;
  const view = session ?? lastSessionRef.current;

  const current = view ? view.exercises[view.currentIndex] : undefined;
  const currentId = current?.exercise.id;
  const setNumber = current ? current.completedSets.length + 1 : 1;
  const remoteHistory = account.workoutRanges.all;

  useEffect(() => {
    if (
      account.status === 'authenticated' &&
      !remoteHistory?.loading &&
      !remoteHistory?.loaded
    ) {
      account.refreshWorkouts();
    }
  }, [account.status, account.refreshWorkouts, remoteHistory?.loaded, remoteHistory?.loading]);

  // Authenticated shadows come only from account history. Demo/signed-out
  // shadows come only from local history, mirroring the account-data policy.
  const previous = useMemo<PreviousExerciseData | null>(() => {
    if (!view || !current) return null;
    if (account.status === 'authenticated') {
      return previousRemoteExercise(
        remoteHistory?.data ?? [],
        view.name,
        current.exercise.name
      );
    }
    if (account.status === 'signedOut' || account.status === 'unconfigured') {
      return previousLocalExercise(history, view.name, current.exercise.name);
    }
    return null;
  }, [account.status, current, history, remoteHistory?.data, view]);

  const [draft, setDraft] = useState({ weight: '', reps: '', rir: '' });
  const [touched, setTouched] = useState({ weight: false, reps: false, rir: false });
  const [attempted, setAttempted] = useState(false);
  const draftKey = `${view?.startedAt ?? 'none'}-${view?.currentIndex ?? 0}-${setNumber}`;
  useEffect(() => {
    setDraft({ weight: '', reps: '', rir: '' });
    setTouched({ weight: false, reps: false, rir: false });
    setAttempted(false);
  }, [draftKey]);

  const validation = useMemo(() => validateSetDraft(draft), [draft]);
  const shadow = previous?.records[setNumber - 1];
  const notesInitialized = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!view || !currentId || !previous) return;
    const key = `${view.startedAt}-${currentId}`;
    if (notesInitialized.current.has(key)) return;
    notesInitialized.current.add(key);
    if (!current?.notes.trim() && previous.notes.trim()) {
      updateExerciseNotes(currentId, previous.notes);
    }
  }, [current?.notes, currentId, previous, updateExerciseNotes, view]);

  // The finished set is held as PENDING while the rest screen fades in over
  // the untouched set screen (thumb parked, segment full). It commits — and
  // everything resets — only once the cover is fully opaque (onShown).
  // NOTE: must be declared BEFORE the early return below — a hook after it
  // crashes the render when discarding/finishing nulls the session.
  const pendingSetRef = useRef<SetRecord | null>(null);

  if (!view) return null;

  const anyWork = view.exercises.some((se) => se.completedSets.length > 0);

  // One segment per set, across the whole workout.
  const segments = view.exercises.flatMap((se, ei) =>
    Array.from({ length: se.targetSets }, (_, si) => ({
      key: `${ei}-${si}`,
      status:
        si < se.completedSets.length
          ? ('done' as const)
          : ei === view.currentIndex && si === se.completedSets.length
            ? ('current' as const)
            : ('todo' as const),
    }))
  );

  const nextUp = current
    ? current.completedSets.length + 1 < current.targetSets
      ? current.exercise.name
      : view.exercises[view.currentIndex + 1]?.exercise.name ?? null
    : null;

  const commitPendingSet = () => {
    if (!pendingSetRef.current) return;
    completeSet(pendingSetRef.current);
    pendingSetRef.current = null;
    slideFrac.setValue(0);
  };

  const handleSetComplete = () => {
    if (!validation.record) {
      setAttempted(true);
      slideFrac.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    const willFinishWorkout =
      view.planned &&
      current !== undefined &&
      view.currentIndex === view.exercises.length - 1 &&
      current.completedSets.length + 1 >= current.targetSets;

    if (willFinishWorkout) {
      // Last set: no rest — fold the final record into the finish atomically.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      finishSession(validation.record);
      onComplete();
    } else {
      pendingSetRef.current = validation.record;
      setResting(true);
    }
  };

  const finishNow = () => {
    const hasDraft = Boolean(draft.weight.trim() || draft.reps.trim() || draft.rir.trim());
    if (hasDraft && !validation.record) {
      setAttempted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    finishSession(hasDraft ? validation.record ?? undefined : undefined);
    if (anyWork || hasDraft) {
      onComplete();
    } else {
      onDiscard();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setConfirmDiscard(true)}
          hitSlop={8}
        >
          <Glass style={styles.headerBtn} interactive>
            <Text style={styles.headerAction}>Discard</Text>
          </Glass>
        </Pressable>
        <Text style={styles.headerTitle}>{view.name}</Text>
        {anyWork ? (
          <Pressable onPress={finishNow} hitSlop={8}>
            <Glass style={styles.headerBtn} interactive>
              <Text style={[styles.headerAction, { color: theme.accent }]}>Finish</Text>
            </Glass>
          </Pressable>
        ) : (
          // Discard covers the no-work case; keep the title centered.
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* One segment per set — the current one fills live with the slide */}
      <View style={styles.progressRow}>
        {segments.length > 0 ? (
          segments.map((s) => <SetSegment key={s.key} status={s.status} liveFrac={slideFrac} />)
        ) : (
          <View style={styles.segmentTrack} />
        )}
      </View>

      {current ? (
        <View style={styles.body}>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text style={styles.exerciseName}>{current.exercise.name}</Text>
              <Pressable onPress={() => setPicker('edit')} hitSlop={10} style={styles.editBtn}>
                {SymbolView ? (
                  <SymbolView name="pencil" size={17} tintColor={theme.textDim} />
                ) : (
                  <Text style={styles.editBtnText}>✎</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.setCounter}>
              Set {setNumber} of {current.targetSets}
            </Text>
          </View>

          <View style={styles.entryArea}>
            <View style={styles.entryRow}>
              <EntryField
                label="LBS"
                decimal
                value={draft.weight}
                shadow={shadow?.weight}
                error={attempted || touched.weight ? validation.errors.weight : undefined}
                onChangeText={(weight) => setDraft((previousDraft) => ({ ...previousDraft, weight }))}
                onBlur={() => setTouched((previous) => ({ ...previous, weight: true }))}
              />
              <EntryField
                label="REPS"
                value={draft.reps}
                shadow={shadow?.reps}
                error={attempted || touched.reps ? validation.errors.reps : undefined}
                onChangeText={(reps) => setDraft((previousDraft) => ({ ...previousDraft, reps }))}
                onBlur={() => setTouched((previous) => ({ ...previous, reps: true }))}
              />
              <EntryField
                label="RIR"
                value={draft.rir}
                shadow={shadow?.rir}
                error={attempted || touched.rir ? validation.errors.rir : undefined}
                onChangeText={(rir) => setDraft((previousDraft) => ({ ...previousDraft, rir }))}
                onBlur={() => setTouched((previous) => ({ ...previous, rir: true }))}
              />
            </View>
            {account.status === 'authenticated' && remoteHistory?.error ? (
              <View style={styles.shadowErrorRow}>
                <Text style={styles.shadowErrorText}>Couldn’t load previous-set shadows.</Text>
                <Pressable onPress={() => account.refreshWorkouts()} hitSlop={8}>
                  <Text style={styles.shadowRetry}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.shadowHint}>
                {account.status === 'authenticated' && remoteHistory?.loading
                  ? 'Loading last-session shadows…'
                  : shadow
                    ? 'Dim values are your matching set from last time'
                    : 'Enter 0 lb for bodyweight · RIR is optional (0–5)'}
              </Text>
            )}
            {(attempted || touched.weight || touched.reps || touched.rir) &&
              Object.values(validation.errors)[0] && (
                <Text style={styles.validationText}>{Object.values(validation.errors)[0]}</Text>
              )}
          </View>

          <View style={styles.notesBlock}>
            <View style={styles.notesHeader}>
              <Text style={styles.notesLabel}>EXERCISE NOTES</Text>
              <Text style={styles.notesCarry}>Carries forward</Text>
            </View>
            <Glass style={styles.notesGlass}>
              <TextInput
                accessibilityLabel="Exercise notes"
                value={current.notes}
                onChangeText={(notes) => currentId && updateExerciseNotes(currentId, notes)}
                placeholder="Cues, setup, pain, tempo…"
                placeholderTextColor={theme.textDim}
                multiline
                maxLength={500}
                textAlignVertical="top"
                style={styles.notesInput}
              />
            </Glass>
          </View>

          <View style={styles.sliderZone}>
            <SlideToComplete
              frac={slideFrac}
              resetKey={`${view.currentIndex}-${setNumber}`}
              onComplete={handleSetComplete}
            />
          </View>
        </View>
      ) : (
        <View style={styles.emptyBody}>
          <Text style={styles.setCounter}>
            {view.planned ? 'All exercises done' : 'What are you doing next?'}
          </Text>
          <Pressable onPress={() => setPicker('add')}>
            <Glass style={styles.addButton} interactive>
              <Text style={styles.addButtonText}>+ Add exercise</Text>
            </Glass>
          </Pressable>
        </View>
      )}

      {picker !== null && (
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>
            {picker === 'edit' ? 'Swap exercise' : 'Add exercise'}
          </Text>
          <FlatList
            data={EXERCISES}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  if (picker === 'edit') {
                    editExercise(view.currentIndex, item);
                  } else {
                    addExercise(item);
                  }
                  setPicker(null);
                }}
              >
                <Text style={styles.pickerRowText}>{item.name}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={() => setPicker(null)} style={styles.pickerCancel}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={confirmDiscard}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDiscard(false)}
      >
        <View style={styles.confirmLayer}>
          <Pressable
            accessibilityLabel="Close discard confirmation"
            style={styles.confirmBackdrop}
            onPress={() => setConfirmDiscard(false)}
          />
          <Glass style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Discard workout?</Text>
            <Text style={styles.confirmBody}>
              Logged sets from this session will be removed. Your persistent exercise notes will
              stay available next time.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirmDiscard(false)} style={styles.confirmPressable}>
                <Glass style={styles.confirmButton} interactive>
                  <Text style={styles.confirmKeep}>Keep workout</Text>
                </Glass>
              </Pressable>
              <Pressable
                style={styles.confirmPressable}
                onPress={() => {
                  setConfirmDiscard(false);
                  discardSession();
                  onDiscard();
                }}
              >
                <Glass style={styles.confirmButton} interactive>
                  <Text style={styles.confirmDiscardText}>Discard workout</Text>
                </Glass>
              </Pressable>
            </View>
          </Glass>
        </View>
      </Modal>

      {resting && (
        <RestTimer
          nextUp={nextUp}
          onShown={commitPendingSet}
          onDone={() => {
            commitPendingSet(); // safety net if the rest ended mid-fade
            setResting(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  headerAction: {
    color: theme.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  headerBtn: {
    borderRadius: 17,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  headerSpacer: {
    width: 84,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    // optical: the big title's cap height sits slightly high of true center
    marginTop: 3,
  },
  editBtnText: {
    color: theme.textDim,
    fontSize: 16,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 3,
    marginHorizontal: 24,
  },
  segmentTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.surfaceHigh,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.accent,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 36,
  },
  exerciseName: {
    color: theme.text,
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  setCounter: {
    color: theme.textDim,
    fontSize: 15,
    marginTop: 8,
  },
  entryArea: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  entryColumn: {
    flex: 1,
  },
  entryLabel: {
    color: theme.textDim,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 7,
    textAlign: 'center',
  },
  entryGlass: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  entryGlassError: {
    borderColor: '#E27878',
  },
  entryInput: {
    color: theme.text,
    fontSize: 25,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 10,
    paddingVertical: 17,
    textAlign: 'center',
  },
  shadowHint: {
    color: theme.textDim,
    fontSize: 11,
    textAlign: 'center',
    minHeight: 14,
  },
  shadowErrorRow: {
    minHeight: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shadowErrorText: {
    color: '#E27878',
    fontSize: 11,
  },
  shadowRetry: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  validationText: {
    color: '#E27878',
    fontSize: 12,
    textAlign: 'center',
  },
  notesBlock: {
    gap: 7,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notesLabel: {
    color: theme.textDim,
    fontSize: 10,
    letterSpacing: 1.3,
  },
  notesCarry: {
    color: theme.accent,
    fontSize: 11,
  },
  notesGlass: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  notesInput: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 21,
    minHeight: 76,
    maxHeight: 112,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  sliderZone: {
    marginTop: 16,
  },
  sliderTrack: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderCharge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_H / 2,
    backgroundColor: theme.accent,
  },
  sliderLabel: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  thumbWrap: {
    position: 'absolute',
    left: TRACK_PAD,
    top: TRACK_PAD,
  },
  thumbGlass: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCharge: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: THUMB / 2,
    backgroundColor: theme.accent,
  },
  thumbChevron: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '600',
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  addButton: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  addButtonText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  picker: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
    zIndex: 5,
  },
  pickerTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  pickerRow: {
    paddingVertical: 14,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
  },
  pickerRowText: {
    color: theme.text,
    fontSize: 16,
  },
  pickerCancel: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  confirmLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 22,
    padding: 18,
  },
  confirmTitle: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 7,
  },
  confirmBody: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 9,
  },
  confirmPressable: {
    flex: 1,
  },
  confirmButton: {
    borderRadius: 15,
    paddingVertical: 11,
    alignItems: 'center',
  },
  confirmKeep: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDiscardText: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '700',
  },
});
