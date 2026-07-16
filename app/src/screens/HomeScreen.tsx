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
import BodyHeatmap from '../3d/BodyHeatmap';
import Glass from '../ui/Glass';
import { levelsFromNet, stimulusScore } from '../analysis/stimulus';
import { useAppState } from '../state/AppState';
import { useAccountState } from '../state/AccountState';
import { workoutAnalysisNetStimulus } from '../api/accountData';
import {
  AccountWorkoutPlan,
  accountWorkoutGroups,
} from '../workout/splitSessions';
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
    pendingSyncCount,
    failedSyncCount,
    syncingWorkoutId,
    retryFailedWorkouts,
  } = useAppState();
  const account = useAccountState();
  const workoutGroups = React.useMemo(
    () => accountWorkoutGroups(account.splits.data),
    [account.splits.data]
  );
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const selectedWorkoutGroup =
    workoutGroups.find((group) => group.id === selectedSplitId) ?? null;
  const { width, height } = useWindowDimensions();

  const accountStimulusNet = React.useMemo(
    () =>
      workoutAnalysisNetStimulus(account.recentStimulus.data?.muscles ?? []),
    [account.recentStimulus.data]
  );
  const weekEffort = React.useMemo(
    () => stimulusScore(account.recentStimulus.data?.muscles ?? []),
    [account.recentStimulus.data]
  );
  const loadedWeekEffort =
    account.status === 'authenticated' &&
    account.recentStimulus.loaded &&
    account.recentStimulus.data
      ? weekEffort
      : null;

  const SHEET_HEIGHT = Math.min(height * 0.64, 580);
  const OPEN_DRAG = SHEET_HEIGHT * 0.5; // finger travel that maps to fully open

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
        ? levelsFromNet(accountStimulusNet)
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

      {(failedSyncCount > 0 || pendingSyncCount > 0 || syncingWorkoutId) && (
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
          <Pressable
            onPress={failedSyncCount > 0 ? retryFailedWorkouts : undefined}
            disabled={failedSyncCount === 0}
          >
            <Glass style={styles.syncBanner} interactive={failedSyncCount > 0}>
              <Text style={[styles.syncText, failedSyncCount > 0 && styles.syncError]}>
                {failedSyncCount > 0
                  ? `${failedSyncCount} workout upload failed · Retry`
                  : 'Syncing workout…'}
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
              {/* Clear weekly stimulus read inside the open sheet */}
              <View style={styles.sheetStimRow}>
                <Text style={styles.sheetStimLabel}>Weekly stimulus</Text>
                <View style={styles.sheetStimTrack}>
                  <View
                    style={[
                      styles.sheetStimFill,
                      { width: `${Math.min(100, loadedWeekEffort ?? 0)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.sheetStimValue}>{loadedWeekEffort ?? '—'}</Text>
              </View>

              {account.splits.loading && !account.splits.loaded ? (
                <Text style={styles.planStatus}>Loading your saved workouts…</Text>
              ) : account.splits.error ? (
                <Pressable onPress={account.refreshSplits}>
                  <Text style={[styles.planStatus, styles.planError]}>
                    Could not load saved workouts. Tap to retry.
                  </Text>
                </Pressable>
              ) : workoutGroups.length === 0 ? (
                <Text style={styles.planStatus}>
                  No saved split sessions yet. Create a split to add planned workouts.
                </Text>
              ) : selectedWorkoutGroup ? (
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
                  {workoutGroups.map((group) => (
                    <Pressable
                      key={group.id}
                      onPress={() => {
                        tick();
                        setSelectedSplitId(group.id);
                      }}
                    >
                      {({ pressed }) => (
                        <View style={[styles.sheetCard, pressed && styles.cardPressed]}>
                          <View style={styles.planTitleRow}>
                            <Text style={styles.cardTitle}>{group.name}</Text>
                            <Text style={styles.planSplit}>›</Text>
                          </View>
                          <Text style={styles.cardSub} numberOfLines={1}>
                            {group.sessions.length} workout {group.sessions.length === 1 ? 'day' : 'days'}
                            {group.cycleLength ? ` · ${group.cycleLength}-day cycle` : ''}
                            {group.sessions.length > 0
                              ? ` · ${group.sessions.map((session) => session.name).join(' · ')}`
                              : ''}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  ))}

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
  sheetStimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  sheetStimLabel: {
    color: theme.textDim,
    fontSize: 12,
  },
  sheetStimTrack: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  sheetStimFill: {
    height: '100%',
    borderRadius: 2.5,
    backgroundColor: theme.accent,
  },
  sheetStimValue: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
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
