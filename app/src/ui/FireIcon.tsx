import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

interface FireIconProps {
  /** Rendered height in points; width follows the glyph's square viewBox. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** False renders a static grey, unlit flame — no flicker plays (e.g. a 0 streak). */
  lit?: boolean;
}

const LIT_COLORS = { outer: '#E8452A', inner: '#FFB238', spark: '#FFE3A3' };
const UNLIT_COLORS = { outer: '#5A5A5A', inner: '#787878' };

// Lucide (ISC license, lucide.dev) "flame" glyph — a well-known, simple
// open-source icon set. Kept as raw path data rather than the
// lucide-react-native package: Lucide icons are single-color/stroke by
// design, and the two-tone fill + inset core below needed the path twice
// at different scales anyway, so there was nothing left for the package
// to do that react-native-svg (already a dependency) doesn't.
const FLAME_PATH =
  'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A single wobbling loop reads as mechanical, not alive — real flame flicker
 * looks organic because several parts move independently, out of phase with
 * each other (this is how motion-graphics flame assets are actually built
 * under the hood: several shape layers with offset keyframes, not one).
 * Lottie/Rive would give more of that for free, but both require a custom
 * dev client and can't run in Expo Go, so it's built procedurally instead,
 * on the same two-tone SVG, with three independently-timed loops.
 *
 * useNativeDriver: false throughout — these values drive react-native-svg's
 * own `transform`/`cx`/`cy` props, not RN View style, and the native
 * animated module's transform/opacity whitelist doesn't cover those; the JS
 * driver has no such restriction, and the per-frame cost is negligible for
 * a handful of values on a 14pt icon.
 *
 * enabled=false parks the value at rest (no loop running at all) rather than
 * animating to a still frame — an unlit flame shouldn't burn CPU either.
 */
function useLoop(duration: number, delay = 0, enabled = true) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay, enabled]);
  return value;
}

export default function FireIcon({ size = 14, style, lit = true }: FireIconProps) {
  // Non-integer-ratio durations so the layers drift in and out of phase
  // instead of moving in lockstep.
  const outer = useLoop(1100, 0, lit);
  const inner = useLoop(750, 90, lit);
  const spark = useLoop(430, 180, lit);
  const colors = lit ? LIT_COLORS : UNLIT_COLORS;

  const outerScaleY = outer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  const outerScaleX = outer.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const outerRotate = outer.interpolate({ inputRange: [0, 1], outputRange: ['-2.5deg', '2deg'] });
  const outerSway = outer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  const innerScaleY = inner.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const innerScaleX = inner.interpolate({ inputRange: [0, 1], outputRange: [1.03, 0.94] });
  const innerOpacity = inner.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  const sparkOpacity = spark.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] });
  const sparkCy = spark.interpolate({ inputRange: [0, 1], outputRange: [10.5, 9] });

  return (
    <Animated.View
      style={[style, { transform: [{ rotate: outerRotate }, { translateX: outerSway }] }]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <AnimatedG transform={[{ scaleX: outerScaleX }, { scaleY: outerScaleY }]}>
          <Path fill={colors.outer} d={FLAME_PATH} />
        </AnimatedG>
        <AnimatedG
          opacity={innerOpacity}
          transform={[{ scaleX: innerScaleX }, { scaleY: innerScaleY }]}
        >
          <G transform="translate(6.2 9.5) scale(0.5)">
            <Path fill={colors.inner} d={FLAME_PATH} />
          </G>
        </AnimatedG>
        {lit && (
          <AnimatedCircle cx={9.5} cy={sparkCy} r={0.9} fill={LIT_COLORS.spark} opacity={sparkOpacity} />
        )}
      </Svg>
    </Animated.View>
  );
}
