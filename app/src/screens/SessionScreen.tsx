import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useAccountState } from '../state/AccountState';
import { EXERCISES } from '../data/exercises';
import { useAppState, ActiveSession, SetRecord } from '../state/AppState';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import PopupLayer from '../ui/PopupLayer';
import PopupContent from '../ui/PopupContent';
import {
  PreviousExerciseData,
  previousLocalExercise,
  previousRemoteExercise,
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

const DEFAULT_SET: SetRecord = { weight: 50, reps: 10 };
// Kept lean — fewer rows keeps the set screen cheap to mount mid-transition.
const WEIGHT_VALUES = Array.from({ length: 61 }, (_, i) => i * 5); // 0–300 by 5
const REP_VALUES = Array.from({ length: 30 }, (_, i) => i + 1); // 1–30
// RIR 0 means the set was taken to failure — the row reads “Failure”, not “0”.
const RIR_VALUES = [0, 1, 2, 3, 4, 5];

const tick = () => Haptics.selectionAsync().catch(() => {});

// History logged by other entry UIs can hold off-grid values (187.5 lb, 405 lb).
// Everything fed to a wheel — initial state AND the ★ marker — must first snap
// to a row, so the value displayed is always exactly the value logged.
const snapTo = (values: number[], target: number): number => {
  let best = values[0];
  for (const v of values) {
    if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  }
  return best;
};

// ── Drag wheel (Apple clock style, glass lens over the selection) ─
const ITEM_H = 40;
const WHEEL_VISIBLE = 5;
const WHEEL_H = ITEM_H * WHEEL_VISIBLE;

function Wheel({
  label,
  values,
  initial,
  markedValue,
  format = String,
  onChange,
}: {
  label: string;
  values: number[];
  initial: number;
  /** Row that gets a subtle star marker (e.g. last weight used) */
  markedValue?: number;
  /** Row label override (e.g. the RIR unset sentinel renders as “—”) */
  format?: (value: number) => string;
  onChange: (v: number) => void;
}) {
  // Start the animated offset AT the initial row so the selected value renders
  // solid white immediately — no dimmed state until first touch. Off-grid
  // values (legacy/foreign data) snap to the nearest row instead of row 0.
  const initialIdx = (() => {
    const exact = values.indexOf(initial);
    if (exact >= 0) return exact;
    let best = 0;
    for (let i = 1; i < values.length; i++) {
      if (Math.abs(values[i] - initial) < Math.abs(values[best] - initial)) best = i;
    }
    return best;
  })();
  const scrollY = useRef(new Animated.Value(initialIdx * ITEM_H)).current;
  const lastIdxRef = useRef(initialIdx);
  // A flick fires onScrollEndDrag with the UN-snapped offset, then momentum
  // carries on — settling there would record a value the wheel doesn't land
  // on. Delay the drag-settle a beat and cancel it if momentum starts.
  const dragSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = (y: number) => {
    const idx = Math.min(values.length - 1, Math.max(0, Math.round(y / ITEM_H)));
    onChange(values[idx]);
  };

  useEffect(() => {
    return () => {
      if (dragSettleRef.current) clearTimeout(dragSettleRef.current);
    };
  }, []);

  return (
    <Glass style={styles.wheelPanel}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <View style={styles.wheelWindow}>
        {/* Selection lens — deliberately NOT a nested GlassView: glass inside
            glass renders unreliably on iOS 26, so this is a crisp overlay. */}
        <View pointerEvents="none" style={styles.wheelLens} />
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentOffset={{ x: 0, y: initialIdx * ITEM_H }}
          contentContainerStyle={{ paddingVertical: (WHEEL_H - ITEM_H) / 2 }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
                if (idx !== lastIdxRef.current) {
                  lastIdxRef.current = idx;
                  tick();
                }
              },
            }
          )}
          scrollEventThrottle={16}
          onMomentumScrollBegin={() => {
            if (dragSettleRef.current) {
              clearTimeout(dragSettleRef.current);
              dragSettleRef.current = null;
            }
          }}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            if (dragSettleRef.current) clearTimeout(dragSettleRef.current);
            dragSettleRef.current = setTimeout(() => {
              dragSettleRef.current = null;
              settle(y);
            }, 64);
          }}
        >
          {values.map((v, i) => {
            const rowLabel = format(v);
            const isWord = !/^[\d.,]+$/.test(rowLabel);
            return (
              <Animated.View
                key={v}
                style={{
                  height: ITEM_H,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: scrollY.interpolate({
                    inputRange: [(i - 2) * ITEM_H, i * ITEM_H, (i + 2) * ITEM_H],
                    outputRange: [0.15, 1, 0.15],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: scrollY.interpolate({
                        inputRange: [(i - 2) * ITEM_H, i * ITEM_H, (i + 2) * ITEM_H],
                        outputRange: [0.78, 1, 0.78],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                }}
              >
                <Text style={isWord ? styles.wheelWord : styles.wheelValue}>{rowLabel}</Text>
                {markedValue === v && <Text style={styles.wheelStar}>★</Text>}
              </Animated.View>
            );
          })}
        </Animated.ScrollView>
      </View>
    </Glass>
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
  revealLabel,
}: {
  frac: Animated.Value;
  onComplete: () => void;
  resetKey: string;
  /** Subtle text (e.g. “+450 lb”) cross-faded in as the thumb travels */
  revealLabel?: string;
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
        {revealLabel ? (
          // The set's volume surfaces as “slide to complete” recedes.
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.sliderRevealWrap,
              {
                opacity: frac.interpolate({
                  inputRange: [0.12, 0.6],
                  outputRange: [0, 0.6],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            <Text style={styles.sliderReveal}>{revealLabel}</Text>
          </Animated.View>
        ) : null}
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
    lastUsed,
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
      account.ensureWorkouts();
    }
  }, [account.status, account.ensureWorkouts, remoteHistory?.loaded, remoteHistory?.loading]);

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

  const shadow = previous?.records[setNumber - 1];

  // The wheels remount when the exercise changes or when previous-set data
  // first arrives (async account history) — NOT between sets, so the user's
  // tweaks carry from set to set exactly like the original wheel UI.
  const wheelEpoch = `${currentId ?? 'none'}-${previous ? 'shadowed' : 'bare'}`;
  const initialRecord: SetRecord = (() => {
    const fallback = (currentId ? lastUsed[currentId] : undefined) ?? DEFAULT_SET;
    const base = previous?.records[setNumber - 1] ?? previous?.records[0] ?? fallback;
    return {
      weight: snapTo(WEIGHT_VALUES, base.weight),
      reps: snapTo(REP_VALUES, base.reps),
      rir: snapTo(RIR_VALUES, base.rir ?? 0),
    };
  })();
  const [weight, setWeight] = useState(initialRecord.weight);
  const [reps, setReps] = useState(initialRecord.reps);
  const [rir, setRir] = useState(initialRecord.rir ?? 0);
  useEffect(() => {
    setWeight(initialRecord.weight);
    setReps(initialRecord.reps);
    setRir(initialRecord.rir ?? 0);
    // Only when the wheels remount — keep the user's tweaks between sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelEpoch]);

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

  // Notes edit in a glass card that extends up out of the collapsed box over
  // a blurred, tinted backdrop. Edits are draft-local: ✓ commits them, ✕ or a
  // backdrop tap discards. One 0..1 value drives backdrop opacity and the
  // card's rise; an easy spring keeps the motion smooth.
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const notesAnim = useRef(new Animated.Value(0)).current;
  const openNotes = () => {
    tick();
    setNotesDraft(current?.notes ?? '');
    setNotesOpen(true);
    Animated.spring(notesAnim, {
      toValue: 1,
      stiffness: 240,
      damping: 27,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };
  const closeNotes = () => {
    Keyboard.dismiss();
    Animated.timing(notesAnim, {
      toValue: 0,
      duration: 210,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setNotesOpen(false);
    });
  };
  const saveNotes = () => {
    if (currentId) updateExerciseNotes(currentId, notesDraft);
    closeNotes();
  };

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

  // Count the not-yet-committed set so the label is stable across the commit:
  // once the pending set lands, `current` itself is whatever comes after rest.
  const setsDone = current
    ? current.completedSets.length + (pendingSetRef.current ? 1 : 0)
    : 0;
  const nextUp = current
    ? setsDone < current.targetSets
      ? current.exercise.name
      : view.exercises[view.currentIndex + 1]?.exercise.name ?? null
    : null;

  // Wheels only land on valid API values, so no draft validation is needed.
  const wheelRecord = (): SetRecord => ({ weight, reps, rir });

  const commitPendingSet = () => {
    if (!pendingSetRef.current) return;
    completeSet(pendingSetRef.current);
    pendingSetRef.current = null;
    slideFrac.setValue(0);
  };

  const handleSetComplete = () => {
    const willFinishWorkout =
      view.planned &&
      current !== undefined &&
      view.currentIndex === view.exercises.length - 1 &&
      current.completedSets.length + 1 >= current.targetSets;

    if (willFinishWorkout) {
      // Last set: no rest — fold the final record into the finish atomically.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      finishSession(wheelRecord());
      onComplete();
    } else {
      pendingSetRef.current = wheelRecord();
      setResting(true);
    }
  };

  const finishNow = () => {
    finishSession();
    if (anyWork) {
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
            <View style={styles.wheelsRow}>
              <Wheel
                key={`${wheelEpoch}-w`}
                label="LBS"
                values={WEIGHT_VALUES}
                initial={initialRecord.weight}
                markedValue={shadow ? snapTo(WEIGHT_VALUES, shadow.weight) : undefined}
                onChange={setWeight}
              />
              <Wheel
                key={`${wheelEpoch}-r`}
                label="REPS"
                values={REP_VALUES}
                initial={initialRecord.reps}
                markedValue={shadow ? snapTo(REP_VALUES, shadow.reps) : undefined}
                onChange={setReps}
              />
              <Wheel
                key={`${wheelEpoch}-i`}
                label="RIR"
                values={RIR_VALUES}
                initial={initialRecord.rir ?? 0}
                markedValue={shadow?.rir == null ? undefined : snapTo(RIR_VALUES, shadow.rir)}
                format={(v) => (v === 0 ? 'Failure' : String(v))}
                onChange={setRir}
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
                  ? 'Loading last-session values…'
                  : shadow
                    ? '★ marks your matching set from last time'
                    : '0 lb = bodyweight · Failure = no reps left'}
              </Text>
            )}
          </View>

          {/* The collapsed box settles back as the editor card takes its
              place. Keep this transform-only because it contains Glass. */}
          <Animated.View
            pointerEvents={notesOpen ? 'none' : 'auto'}
            accessibilityElementsHidden={notesOpen}
            importantForAccessibility={notesOpen ? 'no-hide-descendants' : 'yes'}
            style={{
              transform: [
                {
                  translateY: notesAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 8],
                  }),
                },
                {
                  scale: notesAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.985],
                  }),
                },
              ],
            }}
          >
            <Pressable accessibilityLabel="Notes" onPress={openNotes} disabled={notesOpen}>
              {/* Keep the resting notes surface quiet. Native LiquidGlassView
                  draws its own bright perimeter even without a React Native
                  border, so use a borderless blur until the editor opens. */}
              <BlurView intensity={18} tint="dark" style={styles.notesGlass}>
                <Text
                  numberOfLines={3}
                  style={current.notes.trim() ? styles.notesPreview : styles.notesPlaceholder}
                >
                  {current.notes.trim() || 'Notes'}
                </Text>
              </BlurView>
            </Pressable>
          </Animated.View>

          <View style={styles.sliderZone}>
            <SlideToComplete
              frac={slideFrac}
              resetKey={`${view.currentIndex}-${setNumber}`}
              onComplete={handleSetComplete}
              revealLabel={
                weight > 0 ? `+${(weight * reps).toLocaleString()} lb` : undefined
              }
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

      {notesOpen && current && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.notesLayer, { opacity: notesAnim }]}
        >
          {/* Tap the tinted blur to put the card away */}
          <Pressable
            accessibilityLabel="Close notes"
            style={StyleSheet.absoluteFillObject}
            onPress={closeNotes}
          >
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.notesDim} />
          </Pressable>
          <Animated.View
            style={[
              styles.notesPopupWrap,
              {
                transform: [
                  {
                    scale: notesAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                  {
                    translateY: notesAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [140, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Plain BlurView card, NOT native liquid glass — GlassView can
                fail to composite when mounted inside an animating layer,
                leaving an invisible card over the blurred backdrop. */}
            <BlurView intensity={44} tint="dark" style={styles.notesPopup}>
              <View style={styles.notesActions}>
                <Pressable
                  accessibilityLabel="Discard note edits"
                  onPress={closeNotes}
                  hitSlop={8}
                  style={styles.notesActionBtn}
                >
                  {SymbolView ? (
                    <SymbolView name="xmark" size={14} tintColor={theme.textDim} />
                  ) : (
                    <Text style={styles.notesActionGlyph}>✕</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Save note"
                  onPress={saveNotes}
                  hitSlop={8}
                  style={styles.notesActionBtn}
                >
                  {SymbolView ? (
                    <SymbolView name="checkmark" size={14} tintColor={theme.accent} />
                  ) : (
                    <Text style={[styles.notesActionGlyph, { color: theme.accent }]}>✓</Text>
                  )}
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel="Notes"
                autoFocus
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Notes"
                placeholderTextColor={theme.textDim}
                multiline
                maxLength={500}
                textAlignVertical="top"
                style={styles.notesPopupInput}
              />
            </BlurView>
          </Animated.View>
        </Animated.View>
      )}

      <PopupLayer
        visible={confirmDiscard}
        onDismiss={() => setConfirmDiscard(false)}
        accessibilityLabel="Discard workout confirmation"
        maxWidth={440}
        cardRadius={22}
      >
        <Glass style={styles.confirmCard}>
          <PopupContent>
            <Text style={styles.confirmTitle}>Discard workout?</Text>
            <Text style={styles.confirmBody}>
              Logged sets from this session will be removed. Your persistent exercise notes will
              stay available next time.
            </Text>
          </PopupContent>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setConfirmDiscard(false)} style={styles.confirmPressable}>
              <Glass style={styles.confirmButton} interactive>
                <PopupContent>
                  <Text style={styles.confirmKeep}>Keep workout</Text>
                </PopupContent>
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
                <PopupContent>
                  <Text style={styles.confirmDiscardText}>Discard workout</Text>
                </PopupContent>
              </Glass>
            </Pressable>
          </View>
        </Glass>
      </PopupLayer>

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
  wheelsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  wheelPanel: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  wheelLabel: {
    color: theme.textDim,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  wheelWindow: {
    height: WHEEL_H,
    width: '100%',
  },
  wheelLens: {
    position: 'absolute',
    top: (WHEEL_H - ITEM_H) / 2 - 2,
    left: 12,
    right: 12,
    height: ITEM_H + 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  wheelValue: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  // Word rows (“Failure”) shrink to fit the narrow wheel panels.
  wheelWord: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  wheelStar: {
    position: 'absolute',
    right: 17,
    color: '#7FA98C',
    fontSize: 9,
    opacity: 0.65,
  },
  shadowHint: {
    color: theme.textDim,
    opacity: 0.55,
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
  notesGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  notesPreview: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 20,
  },
  notesPlaceholder: {
    color: theme.textDim,
    fontSize: 15,
  },
  notesLayer: {
    zIndex: 6,
  },
  notesDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  notesPopupWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 110,
  },
  notesPopup: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  notesActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  notesActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  notesActionGlyph: {
    color: theme.textDim,
    fontSize: 15,
    fontWeight: '600',
  },
  notesPopupInput: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 21,
    minHeight: 150,
    maxHeight: 240,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
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
  sliderRevealWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderReveal: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
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
