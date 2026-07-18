import React, { useEffect, useRef, useState } from 'react';
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
  /** Called only once the opaque pool fully covers Home. */
  onCovered: () => void;
  /** Called after the pool drains and Session has been revealed. */
  onFinished: () => void;
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
 * over Home. At full, Root commits the workout and replaces Home with Session;
 * two paint frames later this same overlay drains to reveal the mounted page.
 */
export default function WorkoutLaunchSplash({
  workoutName,
  onCovered,
  onFinished,
}: WorkoutLaunchSplashProps) {
  const { width } = useWindowDimensions();
  const fill = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const coveredRef = useRef(false);
  const finishedRef = useRef(false);
  const onCoveredRef = useRef(onCovered);
  const onFinishedRef = useRef(onFinished);
  const [waveMotionEnabled, setWaveMotionEnabled] = useState(false);
  onCoveredRef.current = onCovered;
  onFinishedRef.current = onFinished;

  useEffect(() => {
    let alive = true;

    const finish = () => {
      if (!alive || finishedRef.current) return;
      finishedRef.current = true;
      onFinishedRef.current();
    };

    const drainAfterSessionPaint = (reduceMotion: boolean) => {
      firstFrameRef.current = requestAnimationFrame(() => {
        firstFrameRef.current = null;
        secondFrameRef.current = requestAnimationFrame(() => {
          secondFrameRef.current = null;
          if (!alive) return;

          const drain = Animated.timing(fill, {
            toValue: 0,
            duration: reduceMotion ? 80 : 480,
            easing: reduceMotion ? Easing.linear : Easing.inOut(Easing.cubic),
            useNativeDriver: false,
          });
          animationRef.current = drain;
          drain.start(({ finished }) => {
            if (animationRef.current === drain) animationRef.current = null;
            if (finished) finish();
          });
        });
      });
    };

    const cover = (reduceMotion: boolean) => {
      if (!alive) return;
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
        onCoveredRef.current();
        drainAfterSessionPaint(reduceMotion);
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

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Starting ${workoutName}`}
      accessibilityValue={{ text: 'Opening workout' }}
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
  waveBand: {
    position: 'absolute',
    top: -WAVE_H,
    left: 0,
    right: 0,
    height: WAVE_H,
    overflow: 'hidden',
  },
});
