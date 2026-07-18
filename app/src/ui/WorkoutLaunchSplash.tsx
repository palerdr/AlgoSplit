import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface WorkoutLaunchSplashProps {
  workoutName: string;
  onFinished: () => void;
}

/**
 * A short, energetic handoff between Home and the live session. It is a plain
 * sibling overlay (never a Glass ancestor), so its opacity and geometry are
 * safe to animate. Session state is committed only after onFinished fires.
 */
export default function WorkoutLaunchSplash({
  workoutName,
  onFinished,
}: WorkoutLaunchSplashProps) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const lockup = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    let alive = true;

    const finish = () => {
      if (!alive || finishedRef.current) return;
      finishedRef.current = true;
      onFinishedRef.current();
    };

    const run = (reduceMotion: boolean) => {
      if (!alive) return;
      opacity.setValue(reduceMotion ? 1 : 0);
      sweep.setValue(reduceMotion ? 0.55 : 0);
      lockup.setValue(reduceMotion ? 1 : 0);
      progress.setValue(reduceMotion ? 1 : 0);

      const animation = reduceMotion
        ? Animated.delay(240)
        : Animated.parallel([
            Animated.sequence([
              Animated.timing(opacity, {
                toValue: 1,
                duration: 90,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.delay(830),
            ]),
            Animated.timing(sweep, {
              toValue: 1,
              duration: 790,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(70),
              Animated.spring(lockup, {
                toValue: 1,
                stiffness: 190,
                damping: 18,
                mass: 0.75,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.delay(180),
              Animated.timing(progress, {
                toValue: 1,
                duration: 560,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
          ]);

      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (animationRef.current === animation) animationRef.current = null;
        if (finished) finish();
      });
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(run)
      .catch(() => run(false));

    return () => {
      alive = false;
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [lockup, opacity, progress, sweep]);

  const sweepTravel = Math.max(width, 420) * 1.85;

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Starting ${workoutName}`}
      accessibilityValue={{ text: 'Preparing workout' }}
      accessibilityLiveRegion="assertive"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[styles.layer, { opacity }]}
    >
      <LinearGradient
        colors={['#07150D', theme.accentDeep, '#102418', theme.bg]}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.sweepBand,
          {
            width: Math.max(width * 0.58, 240),
            height: height * 1.55,
            transform: [
              {
                translateX: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-sweepTravel, sweepTravel],
                }),
              },
              { rotate: '-13deg' },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(65,196,110,0)', 'rgba(125,255,166,0.72)', 'rgba(65,196,110,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.edgeLine,
          {
            transform: [
              {
                translateX: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-width * 0.85, width * 0.9],
                }),
              },
              { rotate: '-13deg' },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.lockup,
          {
            opacity: lockup,
            transform: [
              {
                translateY: lockup.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
              {
                scale: lockup.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>ALGO</Text>
          <View style={styles.wordmarkSlash} />
          <Text style={[styles.wordmark, styles.wordmarkLight]}>SPLIT</Text>
        </View>
        <Text style={styles.kicker}>SESSION READY</Text>
        <Text style={styles.workoutName} numberOfLines={2}>
          {workoutName}
        </Text>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-176, 0],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.bg,
  },
  sweepBand: {
    position: 'absolute',
    top: '-28%',
  },
  edgeLine: {
    position: 'absolute',
    top: '-20%',
    width: 3,
    height: '145%',
    backgroundColor: 'rgba(213,255,225,0.82)',
    shadowColor: theme.accent,
    shadowOpacity: 0.8,
    shadowRadius: 14,
  },
  lockup: {
    width: '82%',
    maxWidth: 420,
    alignItems: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  wordmark: {
    color: theme.text,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: 2.1,
  },
  wordmarkLight: {
    fontWeight: '500',
  },
  wordmarkSlash: {
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: '#9CFFB9',
    transform: [{ rotate: '13deg' }],
  },
  kicker: {
    color: '#A7F5BD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.4,
    marginTop: 24,
  },
  workoutName: {
    color: theme.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  progressTrack: {
    width: 176,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    marginTop: 28,
  },
  progressFill: {
    width: 176,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#B8FFC9',
  },
});
