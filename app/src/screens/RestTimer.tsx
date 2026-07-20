import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { REST_SECONDS } from '../state/AppState';
import { theme } from '../theme';
import {
  completeRestLiveActivity,
  endRestLiveActivity,
  startRestLiveActivity,
} from '../workout/restLiveActivity';
import { playRestCompletionHaptics } from '../workout/restCompletionFeedback';
import {
  createRestDrainTiming,
  resolveRestFinishReason,
  type RestFinishReason,
} from '../workout/restTiming';

interface RestTimerProps {
  /** Name of the exercise coming up after the rest */
  nextUp: string | null;
  /** Length of this rest interval. Defaults to the standard three minutes. */
  durationSeconds?: number;
  /** Fires once the entrance fade reaches full opacity — safe to mutate the screen beneath */
  onShown?: () => void;
  onDone: () => void;
}

const WAVE_H = 22;
// One tile of surface, stretched horizontally (preserveAspectRatio="none").
const WAVE_PATH =
  'M0,11 Q25,2 50,11 T100,11 T150,11 T200,11 T250,11 T300,11 T350,11 T400,11 L400,22 L0,22 Z';

// Endlessly scrolling wave band. Two copies slide left one tile-width, then
// loop — seamless because the tile repeats.
function WaveLayer({
  width,
  duration,
  opacity,
  offset,
}: {
  width: number;
  duration: number;
  opacity: number;
  offset: number;
}) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [duration, x]);

  const tile = width * 2;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: -offset,
        width: tile * 2,
        height: WAVE_H,
        flexDirection: 'row',
        opacity,
        transform: [
          { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, -tile] }) },
        ],
      }}
    >
      <Svg width={tile} height={WAVE_H} viewBox="0 0 400 22" preserveAspectRatio="none">
        <Path d={WAVE_PATH} fill={theme.accentDeep} />
      </Svg>
      <Svg width={tile} height={WAVE_H} viewBox="0 0 400 22" preserveAspectRatio="none">
        <Path d={WAVE_PATH} fill={theme.accentDeep} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Full-screen rest timer: a pool of green water with waves rolling along the
 * surface, draining until the rest ends. Holding anywhere fast-drains the
 * water (and fades the numerals) — hold to the bottom to skip; let go early
 * and the water springs back to the true level, the actual timer untouched.
 */
export default function RestTimer({
  nextUp,
  durationSeconds = REST_SECONDS,
  onShown,
  onDone,
}: RestTimerProps) {
  const { width } = useWindowDimensions();
  // A rest timer is mount-scoped: freezing its timing prevents a parent
  // re-render from restarting or reshaping an interval already in progress.
  const [timing] = useState(() =>
    createRestDrainTiming(
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : REST_SECONDS
    )
  );
  const [secondsLeft, setSecondsLeft] = useState(timing.durationSeconds);
  const fill = useRef(new Animated.Value(1)).current; // 1 = full pool, 0 = drained
  const textOpacity = useRef(new Animated.Value(1)).current;
  // Fades in over the UNCHANGED set screen — the slider stays parked and the
  // segment stays full beneath. `onShown` fires at full opacity, which is when
  // the parent commits the set and resets everything, invisibly.
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const startedAtRef = useRef(Date.now());
  const endsAtRef = useRef(startedAtRef.current + timing.totalMs);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);
  const liveActivityDispositionRef = useRef<'running' | 'completed' | 'ended'>('running');
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;

  // Fraction of the rest that has really elapsed (0..1).
  const elapsedFraction = () =>
    Math.min(1, (Date.now() - startedAtRef.current) / timing.totalMs);

  const finish = (requestedReason: RestFinishReason) => {
    if (committedRef.current) return;
    const reason = resolveRestFinishReason(requestedReason, Date.now(), endsAtRef.current);
    committedRef.current = true;
    if (reason === 'expired') {
      // The completed activity is intentionally left visible after this overlay
      // unmounts so its expanded action can return the user to the workout.
      liveActivityDispositionRef.current = 'completed';
      void completeRestLiveActivity();
      void playRestCompletionHaptics().catch(() => {});
    } else {
      liveActivityDispositionRef.current = 'ended';
      void endRestLiveActivity();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start(() => onDoneRef.current());
  };

  // Run the drain from time-fraction f along the original curve, so a resume
  // after a cancelled hold doesn't replay the fast opening drop.
  const startMainDrain = (f: number) => {
    const remainingMs = Math.max(0, timing.totalMs * (1 - f));
    if (remainingMs <= 0) return;
    const e0 = timing.easing(f);
    const span = 1 - e0 || 1;
    const segment = (u: number) => (timing.easing(f + u * (1 - f)) - e0) / span;
    Animated.timing(fill, {
      toValue: 0,
      duration: remainingMs,
      easing: segment,
      useNativeDriver: false, // animates height
    }).start();
  };

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onShownRef.current?.();
    });
    startedAtRef.current = Date.now();
    endsAtRef.current = startedAtRef.current + timing.totalMs;
    void startRestLiveActivity({
      startedAtMs: startedAtRef.current,
      endsAtMs: endsAtRef.current,
      nextUp,
    });
    startMainDrain(0);

    const tick = setInterval(() => {
      const left =
        timing.durationSeconds - Math.floor((Date.now() - startedAtRef.current) / 1000);
      if (left <= 0) {
        clearInterval(tick);
        setSecondsLeft(0);
        finish('expired');
      } else {
        setSecondsLeft(left);
      }
    }, 250);

    return () => {
      clearInterval(tick);
      holdingRef.current = false;
      committedRef.current = true;
      if (liveActivityDispositionRef.current === 'running') {
        liveActivityDispositionRef.current = 'ended';
        void endRestLiveActivity();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Hold to skip: preview-drain the pool, commit when it empties ──
  const holdStart = () => {
    if (committedRef.current) return;
    holdingRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(textOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    fill.stopAnimation((v) => {
      if (!holdingRef.current || committedRef.current) return;
      Animated.timing(fill, {
        toValue: 0,
        duration: Math.max(260, 850 * v), // rush out from wherever the level is
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && holdingRef.current) finish('skipped');
      });
    });
  };

  const holdEnd = () => {
    const wasHolding = holdingRef.current;
    holdingRef.current = false;
    if (!wasHolding || committedRef.current) return;
    Animated.timing(textOpacity, { toValue: 1, duration: 220, useNativeDriver: false }).start();
    fill.stopAnimation(() => {
      if (committedRef.current) return;
      // Spring back up to the true level; the real timer never moved.
      const trueLevel = Math.max(0, 1 - timing.easing(elapsedFraction()));
      Animated.spring(fill, {
        toValue: trueLevel,
        stiffness: 150,
        damping: 13,
        mass: 1,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !holdingRef.current && !committedRef.current) {
          startMainDrain(elapsedFraction());
        }
      });
    });
  };

  // Slow breathing pulse on the numerals — rest cue, not a stopwatch.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.06,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <Animated.View style={[styles.container, { opacity: overlayOpacity }]}>
      <Pressable style={styles.holdArea} onPressIn={holdStart} onPressOut={holdEnd}>
        <Animated.View
          style={[
            styles.pool,
            {
              height: fill.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        >
          {/* Waves riding the falling waterline */}
          <View style={styles.waveBand} pointerEvents="none">
            <WaveLayer width={width} duration={5600} opacity={0.35} offset={width * 0.65} />
            <WaveLayer width={width} duration={3400} opacity={0.55} offset={0} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.content, { opacity: textOpacity }]} pointerEvents="none">
          <Animated.Text style={[styles.time, { transform: [{ scale: breathe }] }]}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </Animated.Text>
          {nextUp && <Text style={styles.nextUp}>next: {nextUp}</Text>}
          <Text style={styles.skipHint}>hold to skip</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: theme.bg,
    zIndex: 10,
  },
  holdArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pool: {
    width: '100%',
    backgroundColor: 'rgba(10,94,39,0.55)', // theme.accentDeep @ wave opacity
  },
  waveBand: {
    position: 'absolute',
    top: -WAVE_H,
    left: 0,
    right: 0,
    height: WAVE_H,
    overflow: 'hidden',
  },
  content: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    color: theme.text,
    fontSize: 96,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  nextUp: {
    color: theme.textDim,
    fontSize: 15,
    marginTop: 18,
  },
  skipHint: {
    position: 'absolute',
    bottom: 48,
    color: theme.textDim,
    fontSize: 11,
    opacity: 0.6,
  },
});
