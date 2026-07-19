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
  const reviewCover = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const reviewAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const reviewFirstFrameRef = useRef<number | null>(null);
  const reviewSecondFrameRef = useRef<number | null>(null);
  const coveredRef = useRef(false);
  const drainStartedRef = useRef(false);
  const finishedRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const onCoveredRef = useRef(onCovered);
  const onFinishedRef = useRef(onFinished);
  const [covered, setCovered] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [reviewRevealed, setReviewRevealed] = useState(false);
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
      reviewCover.setValue(1);

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
      reviewAnimationRef.current?.stop();
      reviewAnimationRef.current = null;
      if (firstFrameRef.current !== null) cancelAnimationFrame(firstFrameRef.current);
      if (secondFrameRef.current !== null) cancelAnimationFrame(secondFrameRef.current);
      if (reviewFirstFrameRef.current !== null) {
        cancelAnimationFrame(reviewFirstFrameRef.current);
      }
      if (reviewSecondFrameRef.current !== null) {
        cancelAnimationFrame(reviewSecondFrameRef.current);
      }
    };
  }, [fill, reviewCover]);

  // Mount the dark review surface at full opacity behind an opaque green
  // sibling, then lift that sibling away. This fades green into the review
  // without ever opacity-animating native Liquid Glass.
  useEffect(() => {
    if (!covered || phase !== 'reviewing') return;
    setReviewReady(true);
    setReviewRevealed(false);
    reviewCover.setValue(1);
    reviewAnimationRef.current?.stop();
    reviewFirstFrameRef.current = requestAnimationFrame(() => {
      reviewFirstFrameRef.current = null;
      reviewSecondFrameRef.current = requestAnimationFrame(() => {
        reviewSecondFrameRef.current = null;
        const reveal = Animated.timing(reviewCover, {
          toValue: 0,
          duration: reduceMotionRef.current ? 80 : 230,
          easing: reduceMotionRef.current ? Easing.linear : Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        });
        reviewAnimationRef.current = reveal;
        reveal.start(({ finished }) => {
          if (reviewAnimationRef.current === reveal) reviewAnimationRef.current = null;
          if (finished) setReviewRevealed(true);
        });
      });
    });
    return () => {
      if (reviewFirstFrameRef.current !== null) {
        cancelAnimationFrame(reviewFirstFrameRef.current);
        reviewFirstFrameRef.current = null;
      }
      if (reviewSecondFrameRef.current !== null) {
        cancelAnimationFrame(reviewSecondFrameRef.current);
        reviewSecondFrameRef.current = null;
      }
      reviewAnimationRef.current?.stop();
      reviewAnimationRef.current = null;
    };
  }, [covered, phase, reviewCover]);

  // Confirmation mounts Session behind the fully opaque pool. Cover the review
  // with green, unmount its glass controls invisibly, wait two paints, and drain
  // that same green water. Cancel follows the same path back to Home.
  useEffect(() => {
    if (
      !covered ||
      drainStartedRef.current ||
      (phase !== 'revealing' && phase !== 'canceling')
    ) return;

    drainStartedRef.current = true;
    reviewAnimationRef.current?.stop();
    setReviewRevealed(false);
    const beginDrain = () => {
      setReviewReady(false);
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
          drain.start(({ finished: drainFinished }) => {
            if (animationRef.current === drain) animationRef.current = null;
            if (!drainFinished || finishedRef.current) return;
            finishedRef.current = true;
            onFinishedRef.current();
          });
        });
      });
    };

    // Freestyle and empty workouts skip review entirely, so their green pool
    // drains immediately without an artificial content-fade pause.
    if (!reviewReady) {
      reviewCover.setValue(1);
      beginDrain();
      return;
    }

    const conceal = Animated.timing(reviewCover, {
      toValue: 1,
      duration: reduceMotionRef.current ? 80 : 170,
      easing: reduceMotionRef.current ? Easing.linear : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    reviewAnimationRef.current = conceal;
    conceal.start(({ finished }) => {
      if (reviewAnimationRef.current === conceal) reviewAnimationRef.current = null;
      if (!finished) return;
      beginDrain();
    });
  }, [covered, fill, phase, reviewCover, reviewReady]);

  const reviewInteractive = phase === 'reviewing' && reviewReady && reviewRevealed;
  const reviewVisible = covered && reviewReady;
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
      accessible={!reviewInteractive}
      accessibilityRole={!reviewInteractive ? 'progressbar' : undefined}
      accessibilityLabel={!reviewInteractive ? progressLabel : undefined}
      accessibilityValue={!reviewInteractive ? { text: progressValue } : undefined}
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
      {reviewVisible && (
        <View
          style={styles.reviewLayer}
          pointerEvents={reviewInteractive ? 'box-none' : 'none'}
          accessibilityElementsHidden={!reviewInteractive}
          importantForAccessibility={reviewInteractive ? 'yes' : 'no-hide-descendants'}
        >
          {children}
        </View>
      )}
      {reviewVisible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.reviewFadeCover, { opacity: reviewCover }]}
        />
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
    backgroundColor: theme.bg,
  },
  reviewFadeCover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
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
