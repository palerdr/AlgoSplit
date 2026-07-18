import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  nextSplitPlan,
  splitDoneToday,
  splitWorkoutStreak,
} from '../workout/splitStreak';
import { theme } from '../theme';

interface HomeScreenProps {
  /** One-shot: true only on the arrival right after finishing a workout */
  celebrate: boolean;
  onCelebrateHandled: () => void;
  onStartSession: () => void;
  onDetails: () => void;
  onWorkouts: () => void;
  onAccount: () => void;
}

// Sheet progress (0 pill → 1 open sheet) past which releasing opens it.
const ARM_AT = 0.42;
const PILL_H = 78;
const RADIUS = 32;

const tick = () => Haptics.selectionAsync().catch(() => {});
const thump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

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
  onAccount,
}: HomeScreenProps) {
  const {
    recentStimulus,
    startPlannedSession,
    startFreeSession,
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
  const [forceStartPlan, setForceStartPlan] = useState<AccountWorkoutPlan | null>(null);
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
  const activeNextPlan = React.useMemo(
    () => (activeSplit ? nextSplitPlan(activeSplit, splitLogs, Date.now()) : null),
    [activeSplit, splitLogs]
  );
  // Locked to the calendar day: after today's split workout, quick start rests
  // until tomorrow (the day list stays available for intentional doubles).
  const activeDoneToday = React.useMemo(
    () => (activeSplit ? splitDoneToday(activeSplit, splitLogs, Date.now()) : false),
    [activeSplit, splitLogs]
  );
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

  const pick = (plan: AccountWorkoutPlan) => {
    thump();
    startPlannedSession(plan);
    onStartSession();
  };

  const pickFreestyle = () => {
    thump();
    startFreeSession();
    onStartSession();
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
            maxWidth={150}
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
              setSplitPickerOpen(true);
            }}
          >
            <Glass
              style={[styles.homeControlGlass, styles.activeZone]}
              tintColor={HOME_CONTROL_TINT}
              interactive
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
            </Glass>
          </Pressable>
        )}
      </Animated.View>

      {accountStimulusPending && (
        <View pointerEvents="none" style={styles.stimulusLoadingWrap}>
          <Glass style={styles.stimulusLoadingPill}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.stimulusLoadingText}>Loading account stimulus…</Text>
          </Glass>
        </View>
      )}

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

      {account.recentStimulus.error && (
        <Animated.View
          style={[
            styles.stimulusErrorWrap,
            {
              transform: [
                { translateY: uiAnim.interpolate({ inputRange: [0, 1], outputRange: [-130, 0] }) },
              ],
            },
          ]}
        >
          <Pressable onPress={() => account.refreshStimulus()}>
            <Glass style={styles.syncBanner} interactive>
              <Text style={[styles.syncText, styles.syncError]}>Stimulus could not load · Retry</Text>
            </Glass>
          </Pressable>
        </Animated.View>
      )}

      {/* Uploads stay silent unless something actually failed — the dial and
          body already reflect the workout locally. */}
      {failedSyncCount > 0 && (
        <Animated.View
          style={[
            styles.syncBannerWrap,
            {
              transform: [
                { translateY: uiAnim.interpolate({ inputRange: [0, 1], outputRange: [-130, 0] }) },
              ],
            },
          ]}
        >
          <Pressable onPress={retryFailedWorkouts}>
            <Glass style={styles.syncBanner} interactive>
              <Text style={[styles.syncText, styles.syncError]}>
                {`${failedSyncCount} workout upload failed · Retry`}
              </Text>
            </Glass>
          </Pressable>
        </Animated.View>
      )}

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
              <Text style={styles.startText}>Start Workout</Text>
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
                      onPress={() => {
                        tick();
                        setSelectedSplitId(null);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.nestedBack}>‹ Splits</Text>
                    </Pressable>
                    <Text style={styles.nestedTitle}>{selectedWorkoutGroup.name}</Text>
                  </View>
                  {selectedWorkoutGroup.sessions.length === 0 ? (
                    <Text style={styles.planStatus}>This split has no workout days yet.</Text>
                  ) : selectedWorkoutGroup.sessions.map((plan) => (
                    <Pressable key={plan.id} onPress={() => pick(plan)}>
                      {({ pressed }) => (
                        <View style={[styles.sheetCard, pressed && styles.cardPressed]}>
                          <View style={styles.planTitleRow}>
                            <Text style={styles.dayLabel}>Day {plan.dayNumber}</Text>
                            <Text style={styles.cardTitle}>{plan.name}</Text>
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
                  {/* Splits — the default section, no title needed */}
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
                      const quickStart = isActive && !activeDoneToday ? activeNextPlan : null;
                      return (
                        <Pressable
                          key={group.id}
                          onPress={() => {
                            // The active split starts its next workout on the
                            // spot; other splits open their day list. Once
                            // today's assigned workout is done, tapping asks
                            // before starting another — no silent double.
                            if (quickStart) {
                              pick(quickStart);
                              return;
                            }
                            if (isActive && activeDoneToday && activeNextPlan) {
                              tick();
                              setForceStartPlan(activeNextPlan);
                              return;
                            }
                            tick();
                            setSelectedSplitId(group.id);
                          }}
                        >
                          {({ pressed }) => (
                            <View
                              style={[
                                styles.sheetCard,
                                isActive && styles.sheetCardActive,
                                isActive && activeDoneToday && styles.sheetCardDone,
                                pressed && styles.cardPressed,
                              ]}
                            >
                              <View style={styles.planTitleRow}>
                                <Text style={styles.cardTitle}>{group.name}</Text>
                                {isActive ? (
                                  activeStreak > 0 ? (
                                    <View style={styles.activeStreakRow}>
                                      <FireIcon size={13} />
                                      <Text style={styles.activeTag}>{activeStreak}</Text>
                                    </View>
                                  ) : (
                                    <Text style={styles.activeTag}>ACTIVE</Text>
                                  )
                                ) : (
                                  <Text style={styles.planSplit}>›</Text>
                                )}
                              </View>
                              <Text style={styles.cardSub} numberOfLines={1}>
                                {quickStart
                                  ? `Starts Day ${quickStart.dayNumber} ${quickStart.name} · ${
                                      quickStart.exercises.length
                                    } ${quickStart.exercises.length === 1 ? 'exercise' : 'exercises'}`
                                  : `${group.sessions.length} workout ${
                                        group.sessions.length === 1 ? 'day' : 'days'
                                      }${group.cycleLength ? ` · ${group.cycleLength}-day cycle` : ''}${
                                        group.sessions.length > 0
                                          ? ` · ${group.sessions.map((session) => session.name).join(' · ')}`
                                          : ''
                                      }`}
                              </Text>
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
              Lives on your home screen with a streak and one-tap start.
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

      {/* Force-start confirm */}
      <PopupLayer
        visible={forceStartPlan !== null}
        onDismiss={() => setForceStartPlan(null)}
        accessibilityLabel="Workout already completed today"
        maxWidth={380}
        cardRadius={24}
      >
        <Glass style={styles.pickerCard}>
          <PopupContent>
            <Text style={styles.pickerTitle}>Already done for today</Text>
            <Text style={styles.pickerHint}>
              You’ve completed {activeSplit?.name ?? 'this split'}’s assigned workout for today.
            </Text>
          </PopupContent>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start it anyway"
            onPress={() => {
              const plan = forceStartPlan;
              setForceStartPlan(null);
              if (plan) pick(plan);
            }}
          >
            <Glass style={styles.forceStartButton} interactive>
              <PopupContent>
                <Text style={styles.forceStartButtonText}>Start it anyway</Text>
              </PopupContent>
            </Glass>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tick();
              setForceStartPlan(null);
            }}
          >
            <PopupContent>
              <Text style={styles.forceStartCancel}>Not now</Text>
            </PopupContent>
          </Pressable>
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
  syncBannerWrap: {
    position: 'absolute',
    top: 116,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  stimulusErrorWrap: {
    position: 'absolute',
    top: 116,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  stimulusLoadingWrap: {
    position: 'absolute',
    top: 124,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  stimulusLoadingPill: {
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stimulusLoadingText: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  syncBanner: {
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  syncText: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  syncError: {
    color: '#E27878',
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
  sheetCardActive: {
    borderColor: 'rgba(65,196,110,0.5)',
    backgroundColor: 'rgba(65,196,110,0.10)',
  },
  // Passive signal that today's assigned workout is already logged — the
  // explanation lives in the force-start confirm popup, not inline text.
  sheetCardDone: {
    opacity: 0.55,
  },
  forceStartButton: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  forceStartButtonText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  forceStartCancel: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '600',
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  nestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  nestedBack: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  nestedTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  dayLabel: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  planSplit: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
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
