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
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useAccountState } from '../state/AccountState';
import { EXERCISES } from '../data/exercises';
import {
  useAppState,
  ActiveSession,
  REST_SECONDS,
  SetCompletionSource,
  SetRecord,
} from '../state/AppState';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import PopupLayer from '../ui/PopupLayer';
import PopupContent from '../ui/PopupContent';
import WorkoutOrderDeck from '../ui/WorkoutOrderDeck';
import {
  PreviousExerciseData,
  previousLocalExercise,
  previousRemoteExercise,
} from '../workout/logging';
import RestTimer from './RestTimer';
import {
  chainWarmupPending,
  nextSessionStepAfterCompletion,
  restSecondsBeforeSessionStep,
  type SessionStep,
} from '../workout/sessionChain';
import {
  moveSessionBrowseStep,
  sameSessionBrowseStep,
  sessionBrowseSteps,
  type SessionBrowseStep,
} from '../workout/sessionBrowse';

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
type PendingSet =
  | {
      kind: 'working';
      record: SetRecord;
      source: SetCompletionSource;
      nextStep: SessionStep;
    }
  | {
      kind: 'warmup';
      source: SetCompletionSource;
      nextStep: SessionStep;
    };
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
  compact = false,
}: {
  label: string;
  values: number[];
  initial: number;
  /** Row that gets a subtle star marker (e.g. last weight used) */
  markedValue?: number;
  /** Row label override (e.g. the RIR unset sentinel renders as “—”) */
  format?: (value: number) => string;
  onChange: (v: number) => void;
  compact?: boolean;
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
  const wheelHeight = compact ? ITEM_H * 3 : WHEEL_H;
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
    <Glass style={[styles.wheelPanel, compact && styles.wheelPanelCompact]}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <View style={[styles.wheelWindow, { height: wheelHeight }]}>
        {/* Selection lens — deliberately NOT a nested GlassView: glass inside
            glass renders unreliably on iOS 26, so this is a crisp overlay. */}
        <View
          pointerEvents="none"
          style={[styles.wheelLens, { top: (wheelHeight - ITEM_H) / 2 - 2 }]}
        />
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentOffset={{ x: 0, y: initialIdx * ITEM_H }}
          contentContainerStyle={{ paddingVertical: (wheelHeight - ITEM_H) / 2 }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const idx = Math.min(
                  values.length - 1,
                  Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM_H))
                );
                if (idx !== lastIdxRef.current) {
                  lastIdxRef.current = idx;
                  // Persist each visibly selected row as it crosses the lens.
                  // If an arrow immediately unmounts this wheel, the last
                  // value the user saw has already reached its draft/record.
                  onChange(values[idx]);
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
  onSettlingChange,
  resetKey,
  revealLabel,
  actionLabel = 'slide to complete',
  compactActionLabel = false,
}: {
  frac: Animated.Value;
  onComplete: () => void;
  onSettlingChange: (settling: boolean) => void;
  resetKey: string;
  /** Subtle text (e.g. “+450 lb”) cross-faded in as the thumb travels */
  revealLabel?: string;
  actionLabel?: string;
  compactActionLabel?: boolean;
}) {
  const [trackW, setTrackW] = useState(0);
  const maxX = Math.max(1, trackW - THUMB - TRACK_PAD * 2);
  const maxXRef = useRef(1);
  maxXRef.current = maxX;

  const doneRef = useRef(false);
  const armedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onSettlingChangeRef = useRef(onSettlingChange);
  onCompleteRef.current = onComplete;
  onSettlingChangeRef.current = onSettlingChange;

  // New set → thumb back to the start.
  useEffect(() => {
    doneRef.current = false;
    armedRef.current = false;
    onSettlingChangeRef.current(false);
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
          onSettlingChangeRef.current(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          Animated.timing(frac, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }).start(({ finished }) => {
            onSettlingChangeRef.current(false);
            if (finished) onCompleteRef.current();
            else doneRef.current = false;
          });
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
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.sliderLabelWrap,
            {
              opacity: frac.interpolate({
                inputRange: [0, 0.55],
                outputRange: [0.8, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[styles.sliderLabel, compactActionLabel && styles.sliderLabelWarmup]}
          >
            {actionLabel}
          </Text>
        </Animated.View>
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
  focused,
}: {
  status: 'done' | 'current' | 'todo';
  liveFrac: Animated.Value;
  focused: boolean;
}) {
  return (
    <View style={[styles.segmentTrack, focused && styles.segmentTrackFocused]}>
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
      {focused && <View pointerEvents="none" style={styles.segmentFocusRing} />}
    </View>
  );
}

function ExerciseNavButton({
  direction,
  disabled,
  destinationName,
  onPress,
}: {
  direction: -1 | 1;
  disabled: boolean;
  destinationName?: string;
  onPress: () => void;
}) {
  const action = direction < 0 ? 'Previous' : 'Next';
  const accessibilityLabel =
    destinationName === 'Workout summary'
      ? 'Return to workout summary'
      : destinationName
        ? `${action}, ${destinationName}`
        : action;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.exerciseNavPressable}
    >
      <Glass
        style={styles.exerciseNavGlass}
        interactive={!disabled}
      >
        {SymbolView ? (
          <SymbolView
            name={direction < 0 ? 'chevron.left' : 'chevron.right'}
            size={15}
            tintColor={disabled ? 'rgba(255,255,255,0.2)' : theme.text}
          />
        ) : (
          <Text style={[styles.exerciseNavGlyph, disabled && styles.exerciseNavGlyphDisabled]}>
            {direction < 0 ? '‹' : '›'}
          </Text>
        )}
      </Glass>
    </Pressable>
  );
}

function ExerciseNavigator({
  exerciseNames,
  currentIndex,
  primaryLabel,
  previousDestinationName,
  nextDestinationName,
  compact,
  disabled,
  onMove,
  onOpenOrder,
}: {
  exerciseNames: string[];
  currentIndex: number;
  primaryLabel: string;
  previousDestinationName?: string;
  nextDestinationName?: string;
  compact: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onOpenOrder: () => void;
}) {
  const count = exerciseNames.length;
  const atCompleteState = count > 0 && currentIndex >= count;

  return (
    <View style={[styles.exerciseNavigator, compact && styles.exerciseNavigatorCompact]}>
      <ExerciseNavButton
        direction={-1}
        disabled={disabled || !previousDestinationName}
        destinationName={previousDestinationName}
        onPress={() => onMove(-1)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${primaryLabel}. ${
          atCompleteState
            ? `${count} ${count === 1 ? 'exercise' : 'exercises'}`
            : `Exercise ${currentIndex + 1} of ${count}`
        }. Open workout order`}
        accessibilityHint="Reorder exercises or jump to another exercise"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onOpenOrder}
        style={({ pressed }) => [
          styles.exerciseNavCopy,
          styles.exerciseNavOrderButton,
          pressed && !disabled && styles.exerciseNavOrderPressed,
        ]}
      >
        <Text style={styles.exerciseNavPrimary} numberOfLines={1}>
          {primaryLabel}
        </Text>
        <Text style={styles.exerciseNavSecondary} numberOfLines={1}>
          {(atCompleteState
            ? `${count} ${count === 1 ? 'exercise' : 'exercises'}`
            : `Exercise ${currentIndex + 1} of ${count}`) + ' · Order'}
        </Text>
      </Pressable>
      <ExerciseNavButton
        direction={1}
        disabled={disabled || !nextDestinationName}
        destinationName={nextDestinationName}
        onPress={() => onMove(1)}
      />
    </View>
  );
}

// ── Session screen ────────────────────────────────────────────────
export default function SessionScreen({ onComplete, onDiscard }: SessionScreenProps) {
  const {
    history,
    session,
    completeSet,
    updateCompletedSet,
    finishSession,
    addExercise,
    editExercise,
    jumpToSessionExercise,
    reorderSessionExercises,
    setSessionExerciseWarmupEnabled,
    updateExerciseNotes,
    completeWarmupSet,
    discardSession,
    lastUsed,
  } = useAppState();
  const account = useAccountState();
  const { height: screenHeight } = useWindowDimensions();
  const compactLayout = screenHeight < 740;
  const [resting, setResting] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(REST_SECONDS);
  const [picker, setPicker] = useState<'add' | 'edit' | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderDragging, setOrderDragging] = useState(false);
  const [browseStep, setBrowseStep] = useState<SessionBrowseStep | null>(null);

  // Shared slide progress: drives the slider AND the live top-bar segment.
  const slideFrac = useRef(new Animated.Value(0)).current;
  const sliderSettlingRef = useRef(false);
  const [sliderSettling, setSliderSettling] = useState(false);
  const updateSliderSettling = (settling: boolean) => {
    sliderSettlingRef.current = settling;
    setSliderSettling(settling);
  };

  // Finishing/discarding nulls the session while the nav fade is still
  // transparent — keep rendering the last snapshot so the screen doesn't
  // blank out mid-fade. Actions no-op safely against the null session.
  const lastSessionRef = useRef<ActiveSession | null>(null);
  if (session) lastSessionRef.current = session;
  const view = session ?? lastSessionRef.current;

  const browseSteps = view ? sessionBrowseSteps(view.exercises) : [];
  const defaultExercise = view?.exercises[view.currentIndex];
  const defaultExerciseHasSets = Boolean(
    defaultExercise &&
      Number.isInteger(defaultExercise.targetSets) &&
      defaultExercise.targetSets > 0
  );
  const defaultBrowseStep: SessionBrowseStep | null =
    defaultExercise && defaultExerciseHasSets
      ? chainWarmupPending(defaultExercise)
        ? {
            sessionExerciseId: defaultExercise.sessionExerciseId,
            kind: 'warmup',
          }
        : {
            sessionExerciseId: defaultExercise.sessionExerciseId,
            kind: 'working',
            setIndex: Math.min(
              defaultExercise.completedSets.length,
              Math.max(0, defaultExercise.targetSets - 1)
            ),
          }
      : null;
  const selectedBrowseStep =
    browseStep && browseSteps.some((step) => sameSessionBrowseStep(step, browseStep))
      ? browseStep
      : defaultBrowseStep;
  const displayIndex = selectedBrowseStep
    ? view?.exercises.findIndex(
        (exercise) => exercise.sessionExerciseId === selectedBrowseStep.sessionExerciseId
      ) ?? -1
    : view?.currentIndex ?? 0;
  const current = view && displayIndex >= 0 ? view.exercises[displayIndex] : undefined;
  const currentId = current?.exercise.id;
  const currentWarmupPending = Boolean(current && chainWarmupPending(current));
  const warmupActive = Boolean(
    currentWarmupPending && selectedBrowseStep?.kind === 'warmup'
  );
  const warmupRequiredBeforeWork = Boolean(
    currentWarmupPending && selectedBrowseStep?.kind === 'working'
  );
  const selectedWorkingSetIndex =
    selectedBrowseStep?.kind === 'working' ? selectedBrowseStep.setIndex : null;
  const setNumber = selectedWorkingSetIndex === null ? 1 : selectedWorkingSetIndex + 1;
  const selectedSetComplete = Boolean(
    current &&
      selectedWorkingSetIndex !== null &&
      selectedWorkingSetIndex < current.completedSets.length
  );
  const selectedSetIsCurrent = Boolean(
    current &&
      selectedWorkingSetIndex !== null &&
      selectedWorkingSetIndex === current.completedSets.length &&
      selectedWorkingSetIndex < current.targetSets &&
      !currentWarmupPending
  );
  const selectedSetIsFuture = Boolean(
    current &&
      selectedWorkingSetIndex !== null &&
      selectedWorkingSetIndex > current.completedSets.length
  );
  const exerciseComplete = Boolean(
    current && current.completedSets.length >= current.targetSets
  );
  const exerciseNames = view?.exercises.map((exercise) => exercise.exercise.name) ?? [];
  const previousBrowseStep = moveSessionBrowseStep(browseSteps, selectedBrowseStep, -1);
  const nextBrowseStep = moveSessionBrowseStep(browseSteps, selectedBrowseStep, 1);
  const browseDestinationName = (step: SessionBrowseStep | null): string | undefined => {
    if (!step || !view) return undefined;
    const exercise = view.exercises.find(
      (candidate) => candidate.sessionExerciseId === step.sessionExerciseId
    );
    if (!exercise) return undefined;
    return step.kind === 'warmup'
      ? `${exercise.exercise.name} warm-up`
      : `${exercise.exercise.name}, set ${step.setIndex + 1}`;
  };
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
    if (!view || !current || warmupActive) return null;
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
  }, [account.status, current, history, remoteHistory?.data, view, warmupActive]);

  const currentSessionLast = current?.completedSets[current.completedSets.length - 1];
  const selectedCompletedRecord =
    selectedWorkingSetIndex === null
      ? undefined
      : current?.completedSets[selectedWorkingSetIndex];
  const shadow =
    warmupActive || selectedWorkingSetIndex === null
      ? undefined
      : previous?.records[selectedWorkingSetIndex];
  // Once this workout has a logged set, its newest values become the dial
  // markers immediately. Prior-session history is only the opening fallback.
  const markedRecord = warmupActive ? undefined : currentSessionLast ?? shadow;
  const remoteShadowError =
    account.status === 'authenticated' && Boolean(remoteHistory?.error) && !currentSessionLast;
  const remoteShadowLoading =
    account.status === 'authenticated' && Boolean(remoteHistory?.loading) && !currentSessionLast;

  // Each browsable set owns its wheel instance and draft. Moving backward
  // restores that set's committed record; moving forward restores any draft
  // already prepared for that exact pill.
  const browseStepKey =
    selectedBrowseStep?.kind === 'working'
      ? `working-${selectedBrowseStep.setIndex}`
      : selectedBrowseStep?.kind ?? 'none';
  const wheelEpoch = `${current?.sessionExerciseId ?? 'none'}-${
    previous ? 'shadowed' : 'bare'
  }-${browseStepKey}-${selectedSetComplete ? 'complete' : 'entry'}`;
  const initialRecord: SetRecord = (() => {
    const fallback = (currentId ? lastUsed[currentId] : undefined) ?? DEFAULT_SET;
    const base = selectedSetComplete
      ? selectedCompletedRecord ?? currentSessionLast ?? previous?.records[0] ?? fallback
      : currentSessionLast ?? shadow ?? previous?.records[0] ?? fallback;
    return {
      weight: snapTo(WEIGHT_VALUES, base.weight),
      reps: snapTo(REP_VALUES, base.reps),
      rir: snapTo(RIR_VALUES, base.rir ?? 0),
    };
  })();
  const [weight, setWeight] = useState(initialRecord.weight);
  const [reps, setReps] = useState(initialRecord.reps);
  const [rir, setRir] = useState(initialRecord.rir ?? 0);
  const wheelDraftsRef = useRef<Record<string, SetRecord>>({});
  const wheelDraftKey =
    view && current && selectedWorkingSetIndex !== null && !selectedSetComplete
      ? `${view.startedAt}-${current.sessionExerciseId}-working-${setNumber}`
      : null;
  const effectiveInitialRecord =
    (wheelDraftKey ? wheelDraftsRef.current[wheelDraftKey] : undefined) ?? initialRecord;
  useEffect(() => {
    setWeight(effectiveInitialRecord.weight);
    setReps(effectiveInitialRecord.reps);
    setRir(effectiveInitialRecord.rir ?? 0);
    // Only when the exact exercise/set page changes or its initial shadow arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelEpoch]);

  const updateWheelDraft = (update: Partial<SetRecord>) => {
    if (!wheelDraftKey) return;
    const existing = wheelDraftsRef.current[wheelDraftKey] ?? { weight, reps, rir };
    wheelDraftsRef.current[wheelDraftKey] = {
      ...existing,
      ...update,
    };
  };
  const updateSelectedCompletedRecord = (update: Partial<SetRecord>): boolean => {
    if (!selectedSetComplete || !current || selectedWorkingSetIndex === null) return false;
    return updateCompletedSet(
      current.sessionExerciseId,
      selectedWorkingSetIndex,
      update
    );
  };
  const changeWeight = (value: number) => {
    setWeight(value);
    if (updateSelectedCompletedRecord({ weight: value })) return;
    updateWheelDraft({ weight: value });
  };
  const changeReps = (value: number) => {
    setReps(value);
    if (updateSelectedCompletedRecord({ reps: value })) return;
    updateWheelDraft({ reps: value });
  };
  const changeRir = (value: number) => {
    setRir(value);
    if (updateSelectedCompletedRecord({ rir: value })) return;
    updateWheelDraft({ rir: value });
  };

  const notesInitialized = useRef<Set<string>>(new Set());
  useEffect(() => {
    // A warmup is a strictly data-free screen. Defer even the invisible note
    // import until Set 1 appears after the short rest.
    if (!view || !currentId || !previous || warmupActive) return;
    const key = `${view.startedAt}-${currentId}`;
    if (notesInitialized.current.has(key)) return;
    notesInitialized.current.add(key);
    if (!current?.notes.trim() && previous.notes.trim()) {
      updateExerciseNotes(currentId, previous.notes);
    }
  }, [current?.notes, currentId, previous, updateExerciseNotes, view, warmupActive]);

  // Notes edit in a glass card that extends up out of the collapsed box over
  // a blurred, tinted backdrop. Edits are draft-local: ✓ commits them, ✕ or a
  // backdrop tap discards. One 0..1 value drives backdrop opacity and the
  // card's rise; an easy spring keeps the motion smooth.
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const notesAnim = useRef(new Animated.Value(0)).current;
  const openNotes = () => {
    if (sliderSettlingRef.current) return;
    tick();
    notesAnim.stopAnimation();
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
  const closeNotesImmediately = React.useCallback(() => {
    Keyboard.dismiss();
    notesAnim.stopAnimation();
    notesAnim.setValue(0);
    setNotesDraft('');
    setNotesOpen(false);
  }, [notesAnim]);
  const notesContextKey = `${current?.sessionExerciseId ?? 'none'}-${browseStepKey}`;
  const notesContextRef = useRef(notesContextKey);
  useEffect(() => {
    const workoutStepChanged = notesContextRef.current !== notesContextKey;
    notesContextRef.current = notesContextKey;
    if (
      notesOpen &&
      (workoutStepChanged ||
        picker !== null ||
        orderOpen ||
        confirmDiscard ||
        resting ||
        sliderSettling)
    ) {
      closeNotesImmediately();
    }
  }, [
    closeNotesImmediately,
    confirmDiscard,
    notesContextKey,
    notesOpen,
    orderOpen,
    picker,
    resting,
    sliderSettling,
  ]);
  const saveNotes = () => {
    if (currentId) updateExerciseNotes(currentId, notesDraft);
    closeNotes();
  };

  // The finished set is held as PENDING while the rest screen fades in over
  // the untouched set screen (thumb parked, segment full). It commits — and
  // everything resets — only once the cover is fully opaque (onShown).
  // NOTE: must be declared BEFORE the early return below — a hook after it
  // crashes the render when discarding/finishing nulls the session.
  const pendingSetRef = useRef<PendingSet | null>(null);

  if (!view) return null;

  // Preview the exact destination the completion chain will advance to. This
  // uses the same projection as the rest timer, so injected warmups and the
  // final set cannot disagree with the slider copy.
  const completionActionLabel = (() => {
    if (!current) return 'Next: Finish workout';
    const nextStep = nextSessionStepAfterCompletion(
      view.exercises,
      current.sessionExerciseId,
      warmupActive ? 'warmup' : 'working'
    );
    if (!nextStep) return 'Next: Finish workout';

    const destination = view.exercises[nextStep.exerciseIndex];
    if (!destination) return 'Next: Continue workout';
    if (nextStep.kind === 'warmup') {
      return `Next: ${destination.exercise.name} warm-up`;
    }
    return `Next: ${destination.exercise.name}`;
  })();

  const anyWork = view.exercises.some((se) => se.completedSets.length > 0);
  const baseInteractionBlocked =
    resting ||
    pendingSetRef.current !== null ||
    notesOpen ||
    picker !== null ||
    confirmDiscard ||
    sliderSettling;
  const navigationBlocked = baseInteractionBlocked || orderOpen;
  const moveExercise = (direction: -1 | 1) => {
    if (navigationBlocked || sliderSettlingRef.current) return;
    const destination = moveSessionBrowseStep(
      browseSteps,
      selectedBrowseStep,
      direction
    );
    if (!destination) return;
    tick();
    slideFrac.stopAnimation();
    slideFrac.setValue(0);
    setBrowseStep(destination);
    // Keep the persisted exercise cursor aligned with the locally browsed
    // warmup/working page. This does not complete or bypass either step.
    jumpToSessionExercise(destination.sessionExerciseId);
  };
  const jumpExercise = (sessionExerciseId: string) => {
    if (baseInteractionBlocked || sliderSettlingRef.current) return;
    tick();
    slideFrac.stopAnimation();
    slideFrac.setValue(0);
    // Choosing a row from the live order menu is an explicit request to work
    // on it now. It is the sole manual override for that row's pending warmup;
    // arrows and automatic advancement continue to enforce warmups normally.
    setBrowseStep(null);
    jumpToSessionExercise(sessionExerciseId, { bypassWarmup: true });
    setOrderOpen(false);
  };

  // One segment per set, across the whole workout.
  const segments = view.exercises.flatMap((se, ei) => {
    return Array.from({ length: se.targetSets }, (_, si) => ({
      key: `${se.sessionExerciseId}-${si}`,
      // Warmups never receive a segment. A neutral focus appears only when
      // the user is explicitly looking at this exact working set.
      focused:
        selectedBrowseStep?.kind === 'working' &&
        ei === displayIndex &&
        si === selectedBrowseStep.setIndex,
      status:
        si < se.completedSets.length
          ? ('done' as const)
          : selectedSetIsCurrent && ei === displayIndex && si === selectedWorkingSetIndex
            ? ('current' as const)
            : ('todo' as const),
    }));
  });

  // Count the not-yet-committed set so the label is stable across the commit:
  // once the pending set lands, `current` itself is whatever comes after rest.
  const pendingSet = pendingSetRef.current;
  const nextUp = (() => {
    if (!current) return null;
    if (pendingSet) {
      return view.exercises[pendingSet.nextStep.exerciseIndex]?.exercise.name ?? null;
    }
    return current.exercise.name;
  })();

  // Wheels only land on valid API values, so no draft validation is needed.
  const wheelRecord = (): SetRecord => ({ weight, reps, rir });

  const commitPendingSet = () => {
    const pending = pendingSetRef.current;
    if (!pending) return;
    pendingSetRef.current = null;
    if (pending.kind === 'warmup') {
      completeWarmupSet(pending.source);
    } else {
      completeSet(pending.record, pending.source);
    }
    slideFrac.setValue(0);
  };

  const handleSetComplete = () => {
    if (
      !current ||
      (!warmupActive && !selectedSetIsCurrent) ||
      pendingSetRef.current
    ) return;
    const source: SetCompletionSource = {
      exerciseIndex: displayIndex,
      exerciseId: current.exercise.id,
      sessionExerciseId: current.sessionExerciseId,
      kind: warmupActive ? 'warmup' : 'working',
    };

    if (warmupActive) {
      const nextStep = nextSessionStepAfterCompletion(
        view.exercises,
        current.sessionExerciseId,
        'warmup'
      );
      if (!nextStep) {
        completeWarmupSet(source);
        setBrowseStep(null);
        slideFrac.setValue(0);
        return;
      }
      setBrowseStep(null);
      pendingSetRef.current = { kind: 'warmup', source, nextStep };
      // Rest belongs to the destination. A working set always receives the
      // standard rest, even when the outgoing step happened to be a warmup.
      setRestDurationSeconds(restSecondsBeforeSessionStep(nextStep, REST_SECONDS));
      setResting(true);
      return;
    }

    const record = wheelRecord();
    const nextStep = nextSessionStepAfterCompletion(
      view.exercises,
      current.sessionExerciseId,
      'working'
    );

    if (!nextStep) {
      // The final drag is the finish action. completeSet updates the shared
      // session ref synchronously, so finishSession includes this last record
      // even though React batches both state updates from the gesture.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setBrowseStep(null);
      completeSet(record, source);
      slideFrac.setValue(0);
      if (finishSession()) onComplete();
    } else {
      setBrowseStep(null);
      pendingSetRef.current = { kind: 'working', record, source, nextStep };
      // The next automatic step determines the wait: half-rest before a
      // warmup, standard rest before every working set.
      setRestDurationSeconds(restSecondsBeforeSessionStep(nextStep, REST_SECONDS));
      setResting(true);
    }
  };

  const finishNow = () => {
    if (sliderSettlingRef.current || pendingSetRef.current || resting) return;
    const requiredWarmup = view.exercises.find(chainWarmupPending);
    if (requiredWarmup) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      slideFrac.stopAnimation();
      slideFrac.setValue(0);
      // Finish cannot silently discard a checked warmup. Bring the first
      // unresolved one into view without applying the popup-jump override.
      setBrowseStep(null);
      jumpToSessionExercise(requiredWarmup.sessionExerciseId);
      return;
    }
    if (!finishSession()) return;
    if (anyWork) {
      onComplete();
    } else {
      onDiscard();
    }
  };

  return (
    <View style={[styles.container, compactLayout && styles.containerCompact]}>
      <View style={[styles.header, compactLayout && styles.headerCompact]}>
        <Pressable
          onPress={() => {
            if (!sliderSettlingRef.current) setConfirmDiscard(true);
          }}
          hitSlop={8}
          disabled={sliderSettling}
          accessibilityState={{ disabled: sliderSettling }}
          style={[styles.headerSide, styles.headerSideLeft]}
        >
          <Glass style={styles.headerBtn} interactive>
            <Text style={styles.headerAction}>Discard</Text>
          </Glass>
        </Pressable>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
          style={styles.headerTitle}
        >
          {view.name}
        </Text>
        {anyWork ? (
          <Pressable
            onPress={finishNow}
            hitSlop={8}
            disabled={sliderSettling}
            accessibilityState={{ disabled: sliderSettling }}
            style={[styles.headerSide, styles.headerSideRight]}
          >
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
          segments.map((s) => (
            <SetSegment
              key={s.key}
              status={s.status}
              focused={s.focused}
              liveFrac={slideFrac}
            />
          ))
        ) : (
          <View style={styles.segmentTrack} />
        )}
      </View>

      {current ? (
        <View style={[styles.body, compactLayout && styles.bodyCompact]}>
          <View style={[styles.titleBlock, compactLayout && styles.titleBlockCompact]}>
            <View style={[styles.titleRow, compactLayout && styles.titleRowCompact]}>
              <Text
                style={[styles.exerciseName, compactLayout && styles.exerciseNameCompact]}
                numberOfLines={2}
              >
                {current.exercise.name}
              </Text>
              {!warmupActive && (
                <Pressable
                  onPress={() => {
                    if (!sliderSettlingRef.current) setPicker('edit');
                  }}
                  disabled={navigationBlocked}
                  accessibilityState={{ disabled: navigationBlocked }}
                  hitSlop={10}
                  style={styles.editBtn}
                >
                  {SymbolView ? (
                    <SymbolView name="pencil" size={17} tintColor={theme.textDim} />
                  ) : (
                    <Text style={styles.editBtnText}>✎</Text>
                  )}
                </Pressable>
              )}
            </View>
            <ExerciseNavigator
              exerciseNames={exerciseNames}
              currentIndex={displayIndex}
              primaryLabel={
                warmupActive
                  ? 'Warm-up'
                  : selectedSetComplete
                  ? `Set ${setNumber} complete`
                  : `Set ${setNumber} of ${current.targetSets}`
              }
              previousDestinationName={browseDestinationName(previousBrowseStep)}
              nextDestinationName={browseDestinationName(nextBrowseStep)}
              compact={compactLayout}
              disabled={navigationBlocked}
              onMove={moveExercise}
              onOpenOrder={() => {
                tick();
                setOrderOpen(true);
              }}
            />
          </View>

          {warmupActive ? (
            // Warmups remain data-free; the center only offers a restrained
            // load suggestion instead of decorative or trackable metrics.
            <View
              style={styles.warmupSpace}
              pointerEvents="none"
              accessible
              accessibilityRole="text"
              accessibilityLabel="Warm up. It’s suggested to use half the weight of a working set for a warm up."
            >
              <Text style={styles.warmupTitle}>Warm up</Text>
              <Text style={styles.warmupGuidance}>
                It’s suggested to use half the weight of a working set for a warm up.
              </Text>
            </View>
          ) : (
            <View style={styles.entryArea}>
              <View style={styles.wheelsRow}>
                <Wheel
                  key={`${wheelEpoch}-w`}
                  label="LBS"
                  values={WEIGHT_VALUES}
                  initial={effectiveInitialRecord.weight}
                  markedValue={
                    markedRecord ? snapTo(WEIGHT_VALUES, markedRecord.weight) : undefined
                  }
                  onChange={changeWeight}
                  compact={compactLayout}
                />
                <Wheel
                  key={`${wheelEpoch}-r`}
                  label="REPS"
                  values={REP_VALUES}
                  initial={effectiveInitialRecord.reps}
                  markedValue={
                    markedRecord ? snapTo(REP_VALUES, markedRecord.reps) : undefined
                  }
                  onChange={changeReps}
                  compact={compactLayout}
                />
                <Wheel
                  key={`${wheelEpoch}-i`}
                  label="RIR"
                  values={RIR_VALUES}
                  initial={effectiveInitialRecord.rir ?? 0}
                  markedValue={
                    markedRecord?.rir == null
                      ? undefined
                      : snapTo(RIR_VALUES, markedRecord.rir)
                  }
                  format={(v) => (v === 0 ? 'Failure' : String(v))}
                  onChange={changeRir}
                  compact={compactLayout}
                />
              </View>
              {remoteShadowError ? (
                <View style={styles.shadowErrorRow}>
                  <Text style={styles.shadowErrorText}>Couldn’t load previous-set shadows.</Text>
                  <Pressable onPress={() => account.refreshWorkouts()} hitSlop={8}>
                    <Text style={styles.shadowRetry}>Retry</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.shadowHint}>
                  {remoteShadowLoading
                    ? 'Loading last-session values…'
                    : currentSessionLast
                      ? '★ marks your most recently logged set'
                      : shadow
                        ? '★ marks your matching set from last time'
                      : '0 lb = bodyweight · Failure = no reps left'}
                </Text>
              )}
            </View>
          )}

          {/* The resting state is deliberately only text on the page. It
              settles subtly while the separate editor popup takes focus. */}
          {!warmupActive && (
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
              <Pressable
                accessibilityLabel="Notes"
                onPress={openNotes}
                disabled={notesOpen || navigationBlocked}
                accessibilityState={{ disabled: notesOpen || navigationBlocked }}
              >
                <View
                  style={[
                    styles.notesResting,
                    compactLayout && styles.notesRestingCompact,
                  ]}
                >
                  <Text
                    numberOfLines={compactLayout ? 2 : 3}
                    style={current.notes.trim() ? styles.notesPreview : styles.notesPlaceholder}
                  >
                    {current.notes.trim() || 'Notes'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {selectedSetComplete ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${current.exercise.name}, set ${setNumber} complete`}
              style={[styles.sliderZone, compactLayout && styles.sliderZoneCompact]}
            >
              <Glass
                style={[styles.sliderTrack, styles.completedExerciseState]}
                tintColor="rgba(62,85,69,0.18)"
              >
                <Text style={styles.completedExerciseStateText}>
                  {exerciseComplete ? 'Exercise complete' : 'Set complete'}
                </Text>
              </Glass>
            </View>
          ) : warmupRequiredBeforeWork ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${current.exercise.name}, complete its warm-up before logging a working set`}
              style={[styles.sliderZone, compactLayout && styles.sliderZoneCompact]}
            >
              <Glass
                style={[styles.sliderTrack, styles.warmupRequiredState]}
                tintColor="rgba(255,255,255,0.025)"
              >
                <Text style={styles.warmupRequiredStateText}>Complete warm-up first</Text>
              </Glass>
            </View>
          ) : selectedSetIsFuture ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${current.exercise.name}, complete set ${
                current.completedSets.length + 1
              } before set ${setNumber}`}
              style={[styles.sliderZone, compactLayout && styles.sliderZoneCompact]}
            >
              <Glass
                style={[styles.sliderTrack, styles.warmupRequiredState]}
                tintColor="rgba(255,255,255,0.025)"
              >
                <Text style={styles.warmupRequiredStateText}>
                  Complete Set {current.completedSets.length + 1} first
                </Text>
              </Glass>
            </View>
          ) : (
            <View style={[styles.sliderZone, compactLayout && styles.sliderZoneCompact]}>
              <SlideToComplete
                frac={slideFrac}
                resetKey={`${current.sessionExerciseId}-${
                  warmupActive ? 'warmup' : 'working'
                }-${setNumber}`}
                onComplete={handleSetComplete}
                onSettlingChange={updateSliderSettling}
                actionLabel={completionActionLabel}
                compactActionLabel={warmupActive}
                revealLabel={
                  !warmupActive && weight > 0
                    ? `+${(weight * reps).toLocaleString()} lb`
                    : undefined
                }
              />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyBody}>
          <Text style={styles.setCounter}>
            {view.planned ? 'All exercises done' : 'What are you doing next?'}
          </Text>
          {view.exercises.length > 0 && (
            <ExerciseNavigator
              exerciseNames={exerciseNames}
              currentIndex={view.currentIndex}
              primaryLabel="Ready to finish"
              previousDestinationName={browseDestinationName(previousBrowseStep)}
              nextDestinationName={browseDestinationName(nextBrowseStep)}
              compact={compactLayout}
              disabled={navigationBlocked}
              onMove={moveExercise}
              onOpenOrder={() => {
                tick();
                setOrderOpen(true);
              }}
            />
          )}
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
                    editExercise(displayIndex, item);
                  } else {
                    addExercise(item);
                  }
                  setBrowseStep(null);
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

      <PopupLayer
        visible={orderOpen}
        onDismiss={() => setOrderOpen(false)}
        accessibilityLabel="Workout order"
        dismissDisabled={orderDragging}
        maxWidth={660}
        cardRadius={30}
      >
        <WorkoutOrderDeck
          variant="live"
          items={view.exercises.map((exercise, index) => {
            const complete = exercise.completedSets.length >= exercise.targetSets;
            return {
              key: exercise.sessionExerciseId,
              name: exercise.exercise.name,
              targetSets: exercise.targetSets,
              completedSets: exercise.completedSets.length,
              warmupEnabled: exercise.warmupEnabled,
              warmupLocked:
                exercise.warmupCompleted ||
                exercise.warmupBypassed ||
                exercise.completedSets.length > 0,
              current: index === displayIndex,
              // The current row stays anchored and completed work never shifts.
              // Everything upcoming remains one direct, draggable queue.
              draggable: index !== displayIndex && !complete,
            };
          })}
          onReorder={(items) =>
            reorderSessionExercises(items.map((item) => item.key))
          }
          onWarmupChange={(sessionExerciseId, enabled) =>
            setSessionExerciseWarmupEnabled(sessionExerciseId, enabled)
          }
          onDragStateChange={setOrderDragging}
          onJumpTo={(sessionExerciseId) => jumpExercise(sessionExerciseId)}
          onAddExercise={() => {
            setOrderOpen(false);
            setPicker('add');
          }}
          onPrimaryAction={() => setOrderOpen(false)}
          disabled={baseInteractionBlocked}
        />
      </PopupLayer>

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
          durationSeconds={restDurationSeconds}
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
  containerCompact: {
    paddingTop: 46,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  headerCompact: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 6,
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
  headerSide: {
    width: 84,
    flexDirection: 'row',
  },
  headerSideLeft: {
    justifyContent: 'flex-start',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerSpacer: {
    width: 84,
  },
  titleRow: {
    height: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 38,
    gap: 10,
  },
  titleRowCompact: {
    height: 64,
  },
  editBtn: {
    position: 'absolute',
    right: 10,
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
  segmentTrackFocused: {
    backgroundColor: 'rgba(241,236,228,0.18)',
  },
  segmentFocusRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241,236,228,0.48)',
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
  bodyCompact: {
    paddingBottom: 18,
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 26,
  },
  titleBlockCompact: {
    marginTop: 10,
  },
  exerciseName: {
    color: theme.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  exerciseNameCompact: {
    fontSize: 28,
    lineHeight: 32,
  },
  exerciseNavigator: {
    width: '100%',
    maxWidth: 330,
    minHeight: 48,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  exerciseNavigatorCompact: {
    minHeight: 44,
    marginTop: 4,
  },
  exerciseNavPressable: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNavGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNavGlyph: {
    color: theme.text,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '300',
  },
  exerciseNavGlyphDisabled: {
    color: 'rgba(255,255,255,0.2)',
  },
  exerciseNavCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  exerciseNavOrderButton: {
    minHeight: 42,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  exerciseNavOrderPressed: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  exerciseNavPrimary: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  exerciseNavSecondary: {
    color: theme.textDim,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    marginTop: 1,
  },
  setCounter: {
    color: theme.textDim,
    fontSize: 15,
    marginTop: 8,
  },
  entryArea: {
    gap: 8,
  },
  warmupSpace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  warmupTitle: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
  },
  warmupGuidance: {
    maxWidth: 290,
    marginTop: 8,
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    textAlign: 'center',
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
  wheelPanelCompact: {
    paddingVertical: 8,
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
  notesResting: {
    minHeight: 84,
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 14,
  },
  notesRestingCompact: {
    minHeight: 62,
    paddingVertical: 10,
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
  completedExerciseState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(65,196,110,0.055)',
  },
  completedExerciseStateText: {
    color: 'rgba(241,236,228,0.58)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  warmupRequiredState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  warmupRequiredStateText: {
    color: 'rgba(241,236,228,0.48)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  sliderZone: {
    marginTop: 16,
  },
  sliderZoneCompact: {
    marginTop: 6,
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
    alignSelf: 'stretch',
    color: theme.text,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  sliderLabelWrap: {
    justifyContent: 'center',
    paddingLeft: THUMB + TRACK_PAD + 10,
    paddingRight: 14,
  },
  sliderLabelWarmup: {
    fontSize: 13,
    letterSpacing: 0.2,
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
    width: '100%',
    paddingHorizontal: 24,
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
