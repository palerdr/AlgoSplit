import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../theme';

interface WorkoutLaunchSplashProps {
  workoutName: string;
  phase: 'covering' | 'reviewing' | 'revealing' | 'canceling';
  /** Called only once the opaque pool fully covers Home. */
  onCovered: () => void;
  /** Called after the pool drains and Session has been revealed. */
  onFinished: () => void;
  /** Interactive order review, mounted only after the water has settled. */
  children?: ReactNode;
}

// Keep this surface identical to RestTimer. The opaque body is the exact
// visual result of rgba(10,94,39,0.55) composited over theme.bg (#0d0d0d), so
// Home cannot flash through while Root swaps in Session beneath the pool.
const POOL_COLOR = '#0B3A1B';
const WAVE_H = 22;
const WAVE_PATH =
  'M0,11 Q25,2 50,11 T100,11 T150,11 T200,11 T250,11 T300,11 T350,11 T400,11 L400,22 L0,22 Z';

function WaveLayer({
  width,
  duration,
  opacity,
  offset,
  motionEnabled,
}: {
  width: number;
  duration: number;
  opacity: number;
  offset: number;
  motionEnabled: boolean;
}) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    x.setValue(0);
    if (!motionEnabled) return;

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
  }, [duration, motionEnabled, x]);

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
 * Root-owned water wipe for the Home -> Session handoff. The pool first rises
 * over Home and can hold at full height for the workout-order review. Root
 * commits the workout only after confirmation; two paint frames after Session
 * mounts, this same overlay drains to reveal it.
 */
export default function WorkoutLaunchSplash({
  workoutName,
  phase,
  onCovered,
  onFinished,
  children,
}: WorkoutLaunchSplashProps) {
  const { width } = useWindowDimensions();
  const fill = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const coveredRef = useRef(false);
  const drainStartedRef = useRef(false);
  const finishedRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const onCoveredRef = useRef(onCovered);
  const onFinishedRef = useRef(onFinished);
  const [covered, setCovered] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [waveMotionEnabled, setWaveMotionEnabled] = useState(false);
  onCoveredRef.current = onCovered;
  onFinishedRef.current = onFinished;

  useEffect(() => {
    let alive = true;

    const cover = (reduceMotion: boolean) => {
      if (!alive) return;
      reduceMotionRef.current = reduceMotion;
      setWaveMotionEnabled(!reduceMotion);
      fill.setValue(0);

      const rise = Animated.timing(fill, {
        toValue: 1,
        duration: reduceMotion ? 80 : 460,
        easing: reduceMotion ? Easing.linear : Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      });
      animationRef.current = rise;
      rise.start(({ finished }) => {
        if (animationRef.current === rise) animationRef.current = null;
        if (!finished || !alive || coveredRef.current) return;
        coveredRef.current = true;
        setCovered(true);
        onCoveredRef.current();
      });
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(cover)
      .catch(() => cover(false));

    return () => {
      alive = false;
      animationRef.current?.stop();
      animationRef.current = null;
      if (firstFrameRef.current !== null) cancelAnimationFrame(firstFrameRef.current);
      if (secondFrameRef.current !== null) cancelAnimationFrame(secondFrameRef.current);
    };
  }, [fill]);

  // Give the just-settled waterline a tiny visual beat before mounting native
  // glass. The glass itself never sits under an opacity animation.
  useEffect(() => {
    if (!covered || phase !== 'reviewing') {
      setReviewReady(false);
      return;
    }
    const timer = setTimeout(() => setReviewReady(true), 150);
    return () => clearTimeout(timer);
  }, [covered, phase]);

  // Confirmation mounts Session behind the fully opaque pool. Wait for two
  // paints, then drain. Cancel uses the same water motion back to Home without
  // ever creating a session.
  useEffect(() => {
    if (
      !covered ||
      drainStartedRef.current ||
      (phase !== 'revealing' && phase !== 'canceling')
    ) return;

    drainStartedRef.current = true;
    firstFrameRef.current = requestAnimationFrame(() => {
      firstFrameRef.current = null;
      secondFrameRef.current = requestAnimationFrame(() => {
        secondFrameRef.current = null;
        const reduceMotion = reduceMotionRef.current;
        const drain = Animated.timing(fill, {
          toValue: 0,
          duration: reduceMotion ? 80 : 480,
          easing: reduceMotion ? Easing.linear : Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        });
        animationRef.current = drain;
        drain.start(({ finished }) => {
          if (animationRef.current === drain) animationRef.current = null;
          if (!finished || finishedRef.current) return;
          finishedRef.current = true;
          onFinishedRef.current();
        });
      });
    });
  }, [covered, fill, phase]);

  const reviewing = phase === 'reviewing' && reviewReady;
  const progressLabel =
    phase === 'canceling'
      ? 'Closing workout order'
      : phase === 'reviewing'
        ? `Preparing ${workoutName} order`
        : `Starting ${workoutName}`;
  const progressValue =
    phase === 'canceling'
      ? 'Returning to workouts'
      : phase === 'reviewing'
        ? 'Opening order review'
        : 'Opening workout';

  return (
    <View
      accessible={!reviewing}
      accessibilityRole={!reviewing ? 'progressbar' : undefined}
      accessibilityLabel={!reviewing ? progressLabel : undefined}
      accessibilityValue={!reviewing ? { text: progressValue } : undefined}
      accessibilityLiveRegion="assertive"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.layer}
    >
      <Animated.View
        pointerEvents="none"
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
        <View style={styles.waveBand} pointerEvents="none">
          <WaveLayer
            width={width}
            duration={5600}
            opacity={0.35}
            offset={width * 0.65}
            motionEnabled={waveMotionEnabled}
          />
          <WaveLayer
            width={width}
            duration={3400}
            opacity={0.55}
            offset={0}
            motionEnabled={waveMotionEnabled}
          />
        </View>
      </Animated.View>
      {reviewing && (
        <View style={styles.reviewLayer} pointerEvents="box-none">
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  pool: {
    width: '100%',
    backgroundColor: POOL_COLOR,
  },
  reviewLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  waveBand: {
    position: 'absolute',
    top: -WAVE_H,
    left: 0,
    right: 0,
    height: WAVE_H,
    overflow: 'hidden',
  },
});
