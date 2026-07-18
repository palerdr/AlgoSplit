import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import BodyHeatmap from '../3d/BodyHeatmap';
import FireIcon from '../ui/FireIcon';
import Glass from '../ui/Glass';
import PopupLayer from '../ui/PopupLayer';
import PopupContent from '../ui/PopupContent';
import StatusHud from '../ui/StatusHud';
import Tooltip from '../ui/Tooltip';
import { levelsFromNet, stimulusScore } from '../analysis/stimulus';
import { useAppState } from '../state/AppState';
import { useAccountState } from '../state/AccountState';
import { workoutAnalysisNetStimulus } from '../api/accountData';
import {
  AccountWorkoutPlan,
  accountWorkoutGroups,
  templateWorkoutPlans,
} from '../workout/splitSessions';
import {
  mergeSplitLogs,
  splitWorkoutStreak,
} from '../workout/splitStreak';
import { theme } from '../theme';

interface HomeScreenProps {
  /** One-shot: true only on the arrival right after finishing a workout */
  celebrate: boolean;
  onCelebrateHandled: () => void;
  onStartSession: (request: WorkoutLaunchRequest) => boolean;
  onDetails: () => void;
  onWorkouts: () => void;
  onCreateSplit: () => void;
  onAccount: () => void;
  activeSplitLanding: { splitId: string; token: number } | null;
  onActiveSplitLandingHandled: () => void;
}

export type WorkoutLaunchRequest =
  | { kind: 'planned'; plan: AccountWorkoutPlan; workoutName: string }
  | { kind: 'freestyle'; workoutName: string };

// Sheet progress (0 pill → 1 open sheet) past which releasing opens it.
const ARM_AT = 0.42;
const PILL_H = 78;
const RADIUS = 32;

const tick = () => Haptics.selectionAsync().catch(() => {});
const thump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

let SymbolView: React.ComponentType<any> | null = null;
try {
  // SF Symbols on supported Apple platforms, with a text fallback everywhere else.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SymbolView = require('expo-symbols').SymbolView;
} catch {
  SymbolView = null;
}

function NextChevron() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.nextChevronWrap}
    >
      {SymbolView ? (
        <SymbolView name="chevron.right" size={24} tintColor={theme.textDim} />
      ) : (
        <Text style={styles.nextChevronFallback}>›</Text>
      )}
    </View>
  );
}

// Diminishing returns for dragging past the end of the track.
const rubber = (x: number) => x / (1 + x * 1.6);

// ── Weekly stimulus dial ─────────────────────────────────────────
// Floats next to the body model. The arc sweeps gradually to its value while
// the number counts up. Children of the glass animate freely; the glass
// itself is never opacity-animated.
const DIAL_SIZE = 74;
const DIAL_STROKE = 5;
const DIAL_R = (DIAL_SIZE - DIAL_STROKE) / 2;
const DIAL_C = 2 * Math.PI * DIAL_R;
const HOME_CONTROL_TINT = 'rgba(255,255,255,0.025)';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function StimulusDial({ value }: { value: number | null }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number | null>(value === null ? null : 0);

  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      progress.setValue(0);
      return;
    }
    const frac = Math.min(100, Math.max(0, value)) / 100;
    const listener = progress.addListener(({ value: p }) => {
      setDisplay(Math.round(p * 100));
    });
    Animated.timing(progress, {
      toValue: frac,
      duration: 1300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setDisplay(Math.round(frac * 100)));
    return () => progress.removeListener(listener);
  }, [value, progress]);

  return (
    <Glass
      style={[styles.homeControlGlass, styles.dialGlass]}
      tintColor={HOME_CONTROL_TINT}
      interactive
    >
      <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
        <Circle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={DIAL_R}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={DIAL_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={DIAL_R}
          stroke={theme.accent}
          strokeWidth={DIAL_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${DIAL_C} ${DIAL_C}`}
          strokeDashoffset={progress.interpolate({
            inputRange: [0, 1],
            outputRange: [DIAL_C, 0],
          })}
          transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.dialCenter} pointerEvents="none">
        <Text style={styles.dialValue}>{display === null ? '—' : display}</Text>
        <Text style={styles.dialLabel}>stim</Text>
      </View>
    </Glass>
  );
}

export default function HomeScreen({
  celebrate,
  onCelebrateHandled,
  onStartSession,
  onDetails,
  onWorkouts,
  onCreateSplit,
  onAccount,
  activeSplitLanding,
  onActiveSplitLandingHandled,
}: HomeScreenProps) {
  const {
    recentStimulus,
    lastCompleted,
    history,
    failedSyncCount,
    retryFailedWorkouts,
  } = useAppState();
  const account = useAccountState();
  const workoutGroups = React.useMemo(
    () => accountWorkoutGroups(account.splits.data),
    [account.splits.data]
  );
  const templatePlans = React.useMemo(
    () => templateWorkoutPlans(account.workoutTemplates.data),
    [account.workoutTemplates.data]
  );
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  const selectedWorkoutGroup =
    workoutGroups.find((group) => group.id === selectedSplitId) ?? null;
  const { width, height } = useWindowDimensions();

  // Tapping the stim dial explains the score briefly, then fades on its own.
  const [dialTipVisible, setDialTipVisible] = useState(false);
  const dialTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDialTip = () => {
    tick();
    if (dialTipTimerRef.current) clearTimeout(dialTipTimerRef.current);
    setDialTipVisible(true);
    dialTipTimerRef.current = setTimeout(() => setDialTipVisible(false), 2600);
  };
  useEffect(() => {
    return () => {
      if (dialTipTimerRef.current) clearTimeout(dialTipTimerRef.current);
    };
  }, []);

  // ── Active split: streak + the workout a quick start launches ──
  const activeSplit =
    account.splits.data.find((split) => split.id === account.activeSplitId) ?? null;
  const splitLogs = React.useMemo(
    () => mergeSplitLogs(account.workoutSummaries.data.workouts, history),
    [account.workoutSummaries.data.workouts, history]
  );
  const activeStreak = React.useMemo(
    () => (activeSplit ? splitWorkoutStreak(activeSplit, splitLogs, Date.now()) : 0),
    [activeSplit, splitLogs]
  );
  const activeZoneLanding = useRef(new Animated.Value(1)).current;
  const activeZoneLandingAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const landingHandledRef = useRef(onActiveSplitLandingHandled);
  landingHandledRef.current = onActiveSplitLandingHandled;

  // When a split is made active from the Workouts screen, its Home control
  // visibly settles into place. Only descendants of Glass animate, preserving
  // the native Liquid Glass material.
  useEffect(() => {
    if (!activeSplitLanding || activeSplit?.id !== activeSplitLanding.splitId) return;
    let alive = true;
    activeZoneLandingAnimationRef.current?.stop();

    const complete = () => {
      if (alive) landingHandledRef.current();
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!alive) return;
        if (reduceMotion) {
          activeZoneLanding.setValue(1);
          complete();
          return;
        }

        activeZoneLanding.setValue(0);
        const animation = Animated.sequence([
          Animated.timing(activeZoneLanding, {
            toValue: 0.68,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(activeZoneLanding, {
            toValue: 1,
            stiffness: 210,
            damping: 17,
            mass: 0.72,
            useNativeDriver: true,
          }),
        ]);
        activeZoneLandingAnimationRef.current = animation;
        animation.start(({ finished }) => {
          if (activeZoneLandingAnimationRef.current === animation) {
            activeZoneLandingAnimationRef.current = null;
          }
          if (finished) complete();
        });
      })
      .catch(() => {
        if (!alive) return;
        activeZoneLanding.setValue(1);
        complete();
      });

    return () => {
      alive = false;
      activeZoneLandingAnimationRef.current?.stop();
      activeZoneLandingAnimationRef.current = null;
    };
  }, [
    activeSplit?.id,
    activeSplitLanding?.splitId,
    activeSplitLanding?.token,
    activeZoneLanding,
  ]);
  const orderedGroups = React.useMemo(() => {
    if (!activeSplit) return workoutGroups;
    const active = workoutGroups.find((group) => group.id === activeSplit.id);
    if (!active) return workoutGroups;
    return [active, ...workoutGroups.filter((group) => group.id !== active.id)];
  }, [activeSplit, workoutGroups]);

  const accountStimulusNet = React.useMemo(
    () =>
      workoutAnalysisNetStimulus(account.recentStimulus.data?.muscles ?? []),
    [account.recentStimulus.data]
  );
  // Optimistic stimulus: workouts finished after the server analysis was
  // fetched are layered on locally, so the dial and body update instantly.
  // When the post-sync refresh lands (fetchedAt advances), the overlay empties
  // and the server's numbers quietly take over.
  const optimisticNet = React.useMemo(() => {
    if (account.status !== 'authenticated') return null;
    const fetchedAt = account.recentStimulus.fetchedAt ?? 0;
    const unseen = history.filter(
      (workout) => new Date(workout.date).getTime() > fetchedAt
    );
    if (unseen.length === 0) return null;
    const net: Record<string, number> = { ...accountStimulusNet };
    for (const workout of unseen) {
      for (const [region, value] of Object.entries(workout.stimulus)) {
        net[region] = (net[region] ?? 0) + value;
      }
    }
    return net;
  }, [account.status, account.recentStimulus.fetchedAt, accountStimulusNet, history]);
  const displayNet = optimisticNet ?? accountStimulusNet;
  const weekEffort = React.useMemo(
    () =>
      optimisticNet
        ? stimulusScore(optimisticNet)
        : stimulusScore(account.recentStimulus.data?.muscles ?? []),
    [optimisticNet, account.recentStimulus.data]
  );
  const loadedWeekEffort =
    account.status === 'authenticated' &&
    (optimisticNet !== null ||
      (account.recentStimulus.loaded && account.recentStimulus.data))
      ? weekEffort
      : null;

  const SHEET_HEIGHT = Math.min(height * 0.64, 580);
  const OPEN_DRAG = SHEET_HEIGHT * 0.5; // finger travel that maps to fully open

  useEffect(() => {
    if (account.status === 'authenticated') {
      account.ensureWorkoutTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  // Streak and quick-start need logged-workout attribution.
  useEffect(() => {
    if (account.status === 'authenticated' && account.activeSplitId) {
      account.ensureWorkoutSummaries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status, account.activeSplitId]);

  // ── Post-workout celebration ────────────────────────────────────
  // The SAME body model that lives on this screen plays the ending: zoomed in
  // and spinning with the session's stimulus while a check pops, then it lands
  // facing front, zooms back out, and the normal controls settle in. All
  // JS-driven and transform-only (no opacity over glass).
  const [celebrating, setCelebrating] = useState(false);
  const [bodySource, setBodySource] = useState<'recent' | 'session'>('recent');
  const accountStimulusPending =
    bodySource === 'recent' &&
    (account.status === 'checking' ||
      (account.status === 'authenticated' &&
        !account.recentStimulus.loaded &&
        !account.recentStimulus.error));
  const [spinNonce, setSpinNonce] = useState(0);
  const uiAnim = useRef(new Animated.Value(1)).current; // 0 = controls offscreen
  const zoomAnim = useRef(new Animated.Value(1)).current; // body scale
  const checkAnim = useRef(new Animated.Value(0)).current;
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!celebrate) return;
    // Consuming the one-shot flips this effect's dep — so the sequence's timer
    // must live in a ref (cleared on unmount only), NOT in this effect's
    // cleanup, or it gets cancelled instantly and the controls never return.
    onCelebrateHandled();
    setSpinNonce((n) => n + 1);
    setCelebrating(true);
    setBodySource('session');
    uiAnim.setValue(0);
    // Slightly smaller during the spin — it grows back as the home UI returns.
    zoomAnim.setValue(0.9);
    checkAnim.setValue(0);
    Animated.spring(checkAnim, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: false,
    }).start();

    // Let the spin play, then hand the screen back: zoom out, controls in,
    // heat colors ease over to the rolling weekly view.
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = setTimeout(() => {
      handoffTimerRef.current = null;
      setBodySource('recent');
      Animated.parallel([
        Animated.spring(zoomAnim, { toValue: 1, stiffness: 110, damping: 16, mass: 1, useNativeDriver: false }),
        Animated.spring(uiAnim, { toValue: 1, stiffness: 130, damping: 18, useNativeDriver: false }),
        Animated.timing(checkAnim, {
          toValue: 0,
          duration: 360,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ]).start(() => setCelebrating(false));
    }, 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    };
  }, []);

  const bodyLevels =
    bodySource === 'session'
      ? levelsFromNet(lastCompleted?.stimulus ?? {})
      : account.status === 'authenticated'
        ? levelsFromNet(displayNet)
        : recentStimulus;

  // One value drives the morph: the glass pill stretches into the sheet.
  // Height/position are layout props, so this value stays JS-driven.
  const progress = useRef(new Animated.Value(0)).current;
  const [sheetLive, setSheetLive] = useState(false);
  const armedRef = useRef(false);

  const springTo = (toValue: 0 | 1, velocity = 0) => {
    // Flip interactivity at the START of the spring both ways — waiting for
    // the close spring to finish left a dead zone where the scrim ate taps.
    setSheetLive(toValue === 1);
    if (toValue === 0) setSelectedSplitId(null);
    Animated.spring(progress, {
      toValue,
      velocity,
      stiffness: 240,
      damping: 25,
      mass: 1,
      useNativeDriver: false,
    }).start();
  };

  // ── Pill: drag up (or tap) to stretch it into the sheet ────────
  const pillPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        armedRef.current = false;
      },
      onPanResponderMove: (_, g) => {
        const raw = -g.dy / OPEN_DRAG;
        const eased =
          raw < 0 ? -rubber(-raw) * 0.06 : raw <= 1 ? raw : 1 + rubber(raw - 1) * 0.1;
        progress.setValue(eased);
        if (!armedRef.current && raw >= ARM_AT) {
          armedRef.current = true;
          tick();
        } else if (armedRef.current && raw < ARM_AT - 0.1) {
          armedRef.current = false;
          tick();
        }
      },
      onPanResponderRelease: (_, g) => {
        const isTap = Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6;
        const flungOpen = -g.vy > 0.7; // fast upward flick opens from anywhere
        const open = isTap || armedRef.current || flungOpen;
        if (open) thump();
        springTo(open ? 1 : 0, (-g.vy * 1000) / OPEN_DRAG);
      },
      onPanResponderTerminate: () => springTo(0),
    })
  ).current;

  // ── Open sheet: drag the handle down to shrink it back ─────────
  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        const raw = g.dy / OPEN_DRAG;
        const eased = raw < 0 ? 1 + rubber(-raw) * 0.1 : 1 - Math.min(raw, 1);
        progress.setValue(eased);
      },
      onPanResponderRelease: (_, g) => {
        const close = g.dy / OPEN_DRAG > 0.3 || g.vy > 0.7;
        if (close) tick();
        springTo(close ? 0 : 1, (-g.vy * 1000) / OPEN_DRAG);
      },
      onPanResponderTerminate: () => springTo(1),
    })
  ).current;

  const launchPendingRef = useRef(false);

  const queueLaunch = (launch: WorkoutLaunchRequest) => {
    // Root's full-screen water wipe blocks follow-up taps, while this ref
    // closes the tiny window before React commits that overlay.
    if (launchPendingRef.current) return;
    thump();
    launchPendingRef.current = true;
    if (!onStartSession(launch)) launchPendingRef.current = false;
  };

  const pick = (plan: AccountWorkoutPlan) => {
    queueLaunch({ kind: 'planned', plan, workoutName: plan.name });
  };

  const pickFreestyle = () => {
    queueLaunch({ kind: 'freestyle', workoutName: 'Freeball' });
  };

  const clamp = { extrapolate: 'clamp' as const };

  return (
    <View style={styles.container}>
      {/* Heatmap: outer wrapper carries the celebration zoom, inner recedes
          as the start sheet arrives */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoomAnim }] }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45], ...clamp }),
              transform: [
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96], ...clamp }) },
              ],
            },
          ]}
        >
          <BodyHeatmap
            width={width}
            height={height}
            stimulusLevels={bodyLevels}
            spinTrigger={spinNonce}
          />
        </Animated.View>
      </Animated.View>

      {/* Stimulus dial + active-split zone, floating beside the body model */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.topZoneWrap,
          {
            transform: [
              { translateY: uiAnim.interpolate({ inputRange: [0, 1], outputRange: [-180, 0] }) },
            ],
          },
        ]}
      >
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              loadedWeekEffort === null
                ? 'Weekly stimulus score, loading'
                : `Weekly stimulus score, ${Math.round(loadedWeekEffort)} out of 100`
            }
            accessibilityHint="Shows your weekly training stimulus on a zero to one hundred scale"
            hitSlop={8}
            onPress={showDialTip}
          >
            <StimulusDial value={loadedWeekEffort} />
          </Pressable>
          <Tooltip
            visible={dialTipVisible}
            text="Weekly training stimulus, scored 0–100"
            pointer="top"
            caretOffset={DIAL_SIZE / 2}
            maxWidth={220}
            style={styles.dialTipPosition}
          />
        </View>
        {account.status === 'authenticated' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeSplit ? `Active split ${activeSplit.name}` : 'Choose an active split'
            }
            style={styles.activeZonePress}
            onPress={() => {
              tick();
              if (
                account.splits.loaded &&
                !account.splits.error &&
                account.splits.data.length === 0
              ) {
                onCreateSplit();
                return;
              }
              setSplitPickerOpen(true);
            }}
          >
            <Glass
              style={[styles.homeControlGlass, styles.activeZone]}
              tintColor={HOME_CONTROL_TINT}
              interactive
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activeLandingGlow,
                  {
                    opacity: activeZoneLanding.interpolate({
                      inputRange: [0, 0.55, 1],
                      outputRange: [0, 0.34, 0],
                    }),
                    transform: [
                      {
                        scaleX: activeZoneLanding.interpolate({
                          inputRange: [0, 0.68, 1],
                          outputRange: [0.55, 1.04, 1.08],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={{
                  opacity: activeZoneLanding.interpolate({
                    inputRange: [0, 0.28, 1],
                    outputRange: [0, 1, 1],
                  }),
                  transform: [
                    {
                      translateY: activeZoneLanding.interpolate({
                        inputRange: [0, 0.68, 1],
                        outputRange: [13, -2, 0],
                      }),
                    },
                    {
                      scale: activeZoneLanding.interpolate({
                        inputRange: [0, 0.68, 1],
                        outputRange: [0.94, 1.025, 1],
                      }),
                    },
                  ],
                }}
              >
                {activeSplit ? (
                  <View style={styles.activeZoneRow}>
                    <Text style={styles.activeZoneName} numberOfLines={1}>
                      {activeSplit.name}
                    </Text>
                    <View style={styles.activeStreakRow}>
                      <FireIcon size={15} lit={activeStreak > 0} />
                      {activeStreak > 0 && <Text style={styles.activeTag}>{activeStreak}</Text>}
                    </View>
                  </View>
                ) : (
                  <View style={styles.activeZoneRow}>
                    <Text style={styles.activeZoneEmpty}>No active split</Text>
                    <Text style={styles.activeZonePlus}>+</Text>
                  </View>
                )}
              </Animated.View>
            </Glass>
          </Pressable>
        )}
      </Animated.View>

      {failedSyncCount > 0 ? (
        <StatusHud
          kind="error"
          label={`${failedSyncCount} upload${failedSyncCount === 1 ? '' : 's'} failed`}
          onPress={() => {
            tick();
            retryFailedWorkouts();
          }}
        />
      ) : account.recentStimulus.error ? (
        <StatusHud
          kind="error"
          label="Stimulus unavailable"
          onPress={() => {
            tick();
            account.refreshStimulus();
          }}
        />
      ) : accountStimulusPending ? (
        <StatusHud kind="loading" label="Syncing stimulus" />
      ) : null}

      <Animated.View
        style={[
          styles.topRow,
          {
            transform: [
              { translateY: uiAnim.interpolate({ inputRange: [0, 1], outputRange: [-130, 0] }) },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable onPress={() => { tick(); onDetails(); }}>
          <Glass style={styles.smallButton} interactive>
            <Text style={styles.smallButtonText}>Details</Text>
          </Glass>
        </Pressable>
        <Pressable onPress={() => { tick(); onWorkouts(); }}>
          <Glass style={styles.smallButton} interactive>
            <Text style={styles.smallButtonText}>Workouts</Text>
          </Glass>
        </Pressable>
        <Pressable onPress={() => { tick(); onAccount(); }}>
          <Glass style={styles.smallButton} interactive>
            <Text style={styles.smallButtonText}>Account</Text>
          </Glass>
        </Pressable>
      </Animated.View>

      {/* Scrim behind the sheet; tap to dismiss */}
      <Animated.View
        pointerEvents={sheetLive ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          styles.scrim,
          { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], ...clamp }) },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { tick(); springTo(0); }} />
      </Animated.View>


      {/* The morphing glass: pill when closed, stretches into the sheet */}
      <Animated.View
        style={[
          styles.morphWrap,
          {
            left: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 10], ...clamp }),
            right: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 10], ...clamp }),
            bottom: progress.interpolate({ inputRange: [0, 1], outputRange: [36, 10], ...clamp }),
            height: progress.interpolate({
              inputRange: [-0.1, 0, 1, 1.1],
              outputRange: [PILL_H - 6, PILL_H, SHEET_HEIGHT, SHEET_HEIGHT + SHEET_HEIGHT * 0.04],
            }),
            transform: [
              { translateY: uiAnim.interpolate({ inputRange: [0, 1], outputRange: [240, 0] }) },
            ],
          },
        ]}
        {...(sheetLive ? {} : pillPan.panHandlers)}
      >
        <Glass style={styles.morphGlass} interactive>
          <View style={styles.morphClip}>
            {/* Week Effort: a wordless left-to-right shade under the glass
                highlights — its reach IS the meter, its right edge blurring
                into nothing. Fades on interaction. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.effortShade,
                {
                  width: `${Math.min(100, Math.max(0, weekEffort))}%`,
                  opacity: progress.interpolate({
                    inputRange: [-0.05, 0, 0.12],
                    outputRange: [0, 1, 0],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(35,162,74,0.16)', 'rgba(35,162,74,0.14)', 'rgba(35,162,74,0)']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Handle — pill face when closed, sheet header when open */}
            <View style={styles.handleZone} {...(sheetLive ? sheetPan.panHandlers : {})}>
              <View style={styles.grabber} />
              <Text style={styles.startText} numberOfLines={1}>
                {selectedWorkoutGroup?.name ?? 'Start Workout'}
              </Text>
            </View>

            {/* Workout list, revealed as the glass stretches */}
            <Animated.View
              pointerEvents={sheetLive ? 'auto' : 'none'}
              style={[
                styles.cards,
                {
                  opacity: progress.interpolate({
                    inputRange: [0.35, 0.9],
                    outputRange: [0, 1],
                    ...clamp,
                  }),
                  transform: [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0.35, 1],
                        outputRange: [26, 0],
                        ...clamp,
                      }),
                    },
                  ],
                },
              ]}
            >
              {/* Cards are translucent, NOT nested GlassViews — glass inside
                  glass renders unreliably on iOS 26. Scrolls so any number of
                  user-created templates stays reachable. */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                scrollEnabled={sheetLive}
                contentContainerStyle={styles.cardsScroll}
              >
              {selectedWorkoutGroup ? (
                <View>
                  <View style={styles.nestedHeader}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Back to splits"
                      onPress={() => {
                        tick();
                        setSelectedSplitId(null);
                      }}
                      hitSlop={8}
                      style={styles.nestedBackButton}
                    >
                      {SymbolView ? (
                        <SymbolView name="chevron.left" size={14} tintColor={theme.textDim} />
                      ) : (
                        <Text style={styles.nestedBackArrow}>‹</Text>
                      )}
                      <Text style={styles.nestedBack}>Back</Text>
                    </Pressable>
                  </View>
                  {selectedWorkoutGroup.sessions.length === 0 ? (
                    <Text style={styles.planStatus}>This split has no workout days yet.</Text>
                  ) : selectedWorkoutGroup.sessions.map((plan) => (
                    <Pressable key={plan.id} onPress={() => pick(plan)}>
                      {({ pressed }) => (
                        <View style={[styles.sheetCard, pressed && styles.cardPressed]}>
                          <View style={styles.planTitleRow}>
                            <Text style={styles.dayLabel}>Day {plan.dayNumber}</Text>
                            <Text
                              style={[styles.cardTitle, styles.selectedDayTitle]}
                              numberOfLines={1}
                            >
                              {plan.name}
                            </Text>
                          </View>
                          <Text style={styles.cardSub}>
                            {plan.exercises.length} {plan.exercises.length === 1 ? 'exercise' : 'exercises'}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View>
                  <Text style={styles.sheetSectionLabel}>Splits</Text>
                  {account.splits.loading && !account.splits.loaded ? (
                    <Text style={styles.planStatus}>Loading your saved splits…</Text>
                  ) : account.splits.error ? (
                    <Pressable onPress={account.refreshSplits}>
                      <Text style={[styles.planStatus, styles.planError]}>
                        Could not load saved splits. Tap to retry.
                      </Text>
                    </Pressable>
                  ) : workoutGroups.length === 0 ? (
                    <Text style={styles.planStatus}>
                      No saved splits yet. Create one from the Workouts screen.
                    </Text>
                  ) : (
                    orderedGroups.map((group) => {
                      const isActive = group.id === activeSplit?.id;
                      const dayCount = group.cycleLength ?? 7;
                      return (
                        <Pressable
                          key={group.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${group.name}, ${dayCount} day cycle`}
                          onPress={() => {
                            tick();
                            setSelectedSplitId(group.id);
                          }}
                        >
                          {({ pressed }) => (
                            <View
                              style={[
                                styles.sheetCard,
                                styles.splitRowCard,
                                isActive && styles.sheetSplitCardActive,
                                pressed && styles.cardPressed,
                              ]}
                            >
                              <Text style={styles.splitRowName} numberOfLines={1}>
                                {group.name}
                              </Text>
                              <Text style={styles.splitDayCount}>
                                {dayCount} day cycle
                              </Text>
                              <NextChevron />
                            </View>
                          )}
                        </Pressable>
                      );
                    })
                  )}

                  {/* Standalone saved workouts — start one without a split */}
                  <Text style={styles.sheetSectionLabel}>Workouts</Text>
                  {templatePlans.length === 0 ? (
                    <Text style={styles.planStatus}>
                      {account.workoutTemplates.loading && !account.workoutTemplates.loaded
                        ? 'Loading your saved workouts…'
                        : 'No saved workouts yet. Create one from the Workouts screen.'}
                    </Text>
                  ) : (
                    templatePlans.map((plan) => (
                      <Pressable key={plan.id} onPress={() => pick(plan)}>
                        {({ pressed }) => (
                          <View style={[styles.sheetCard, pressed && styles.cardPressed]}>
                            <Text style={styles.cardTitle}>{plan.name}</Text>
                            <Text style={styles.cardSub}>
                              {plan.exercises.length}{' '}
                              {plan.exercises.length === 1 ? 'exercise' : 'exercises'}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    ))
                  )}

                  {/* A free workout remains available without substituting demo plans. */}
                  <View style={styles.lastRow}>
                    <Pressable style={{ flex: 1 }} onPress={pickFreestyle}>
                      {({ pressed }) => (
                        <View
                          style={[
                            styles.sheetCard,
                            styles.freeCard,
                            styles.lastRowCard,
                            pressed && styles.cardPressed,
                          ]}
                        >
                          <Text style={styles.cardTitle}>Freeball</Text>
                          <Text style={styles.cardSub}>Pick exercises as you go</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
            </Animated.View>
          </View>
        </Glass>
      </Animated.View>

      {/* Celebration check — pops in over the spinning body, fades as the
          normal UI returns */}
      {celebrating && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.celebration,
            {
              opacity: checkAnim,
              transform: [
                { scale: checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.check}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.celebrationText}>
            {lastCompleted?.name ?? 'Workout'} complete
          </Text>
        </Animated.View>
      )}

      {/* Active-split picker */}
      <PopupLayer
        visible={splitPickerOpen}
        onDismiss={() => setSplitPickerOpen(false)}
        accessibilityLabel="Active split picker"
        maxWidth={380}
        cardRadius={24}
      >
        <Glass style={styles.pickerCard}>
          <PopupContent>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Active split</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close active split picker"
                hitSlop={8}
                onPress={() => setSplitPickerOpen(false)}
              >
                <Text style={styles.pickerDone}>Done</Text>
              </Pressable>
            </View>
            <Text style={styles.pickerHint}>
              {activeSplit
                ? `You’ve maintained this split for ${activeStreak} ${
                    activeStreak === 1 ? 'day' : 'days'
                  }.`
                : 'Lives on your home screen with a streak and one-tap start.'}
            </Text>
            <ScrollView
              style={styles.pickerList}
              showsVerticalScrollIndicator={false}
            >
              {account.splits.data.map((split) => {
                const isCurrent = split.id === account.activeSplitId;
                return (
                  <Pressable
                    key={split.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Make ${split.name} the active split`}
                    onPress={() => {
                      thump();
                      account.setActiveSplit(split.id);
                      setSplitPickerOpen(false);
                    }}
                    style={styles.pickerRow}
                  >
                    <Text
                      style={[styles.pickerRowText, isCurrent && styles.pickerRowCurrent]}
                      numberOfLines={1}
                    >
                      {split.name}
                    </Text>
                    {isCurrent && <Text style={styles.pickerRowCurrent}>✓</Text>}
                  </Pressable>
                );
              })}
              {account.splits.data.length === 0 && (
                <Text style={styles.pickerHint}>
                  No splits yet — create one from the Workouts screen.
                </Text>
              )}
            </ScrollView>
            {activeSplit && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tick();
                  account.setActiveSplit(null);
                  setSplitPickerOpen(false);
                }}
              >
                <Text style={styles.pickerClear}>Clear active split</Text>
              </Pressable>
            )}
          </PopupContent>
        </Glass>
      </PopupLayer>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topRow: {
    position: 'absolute',
    top: 64,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  smallButton: {
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  smallButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  effortShade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  topZoneWrap: {
    position: 'absolute',
    top: 132,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // One geometry/material contract for the two home controls. The dial is
  // circular and the active-split control extends that same circle into a
  // capsule, so their height, end radius, edge, and tint always match.
  homeControlGlass: {
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  dialGlass: {
    width: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 20,
  },
  dialLabel: {
    color: theme.textDim,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dialTipPosition: {
    position: 'absolute',
    top: DIAL_SIZE + 8,
    left: 0,
  },
  // Hugs the right edge and stays narrow so the body model keeps its space.
  activeZonePress: {
    marginLeft: 'auto',
    width: 168,
  },
  activeZone: {
    width: '100%',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLandingGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DIAL_SIZE / 2,
    backgroundColor: theme.accent,
  },
  activeZoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  activeZoneName: {
    color: theme.text,
    fontSize: 13.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  activeZoneEmpty: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  activeZonePlus: {
    color: theme.textDim,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 15,
  },
  pickerCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pickerTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  pickerDone: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerHint: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 320,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.09)',
  },
  pickerRowText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  pickerRowCurrent: {
    color: theme.accent,
    fontWeight: '700',
  },
  pickerClear: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 14,
  },
  activeTag: {
    color: theme.accent,
    fontSize: 9,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  activeStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 8,
  },
  sheetSectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 4,
    marginTop: 14,
    marginBottom: 9,
  },
  lastRowCard: {
    marginBottom: 0,
  },
  morphWrap: {
    position: 'absolute',
  },
  morphGlass: {
    flex: 1,
    borderRadius: RADIUS,
  },
  morphClip: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 9,
  },
  startText: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
    maxWidth: '86%',
  },
  cards: {
    flex: 1,
    paddingTop: 6,
  },
  cardsScroll: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  sheetCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  splitRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
  },
  sheetSplitCardActive: {
    borderColor: 'rgba(65,196,110,0.52)',
    backgroundColor: 'rgba(65,196,110,0.11)',
  },
  splitRowName: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
  },
  splitDayCount: {
    color: theme.textDim,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  nextChevronFallback: {
    color: theme.textDim,
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '300',
  },
  nextChevronWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  planStatus: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  planError: {
    color: '#E27878',
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  nestedBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nestedBack: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  nestedBackArrow: {
    color: theme.textDim,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '300',
  },
  dayLabel: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedDayTitle: {
    flex: 1,
    marginBottom: 0,
    textAlign: 'right',
  },
  freeCard: {
    opacity: 0.85,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSub: {
    color: theme.textDim,
    fontSize: 12.5,
    lineHeight: 17,
  },
  celebration: {
    position: 'absolute',
    top: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  check: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: theme.text,
    fontSize: 30,
    fontWeight: '700',
  },
  celebrationText: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
});
