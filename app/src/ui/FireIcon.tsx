import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface FireIconProps {
  /** Rendered height in points; width follows the glyph's square viewBox. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** False renders a static grey, unlit flame — no flicker plays (e.g. a 0 streak). */
  lit?: boolean;
}

const LIT_COLORS = { outer: '#FF6723', inner: '#FFB02E' };
const UNLIT_COLORS = { outer: '#5A5A5A', inner: '#787878' };

// Microsoft Fluent Emoji "Fire" (flat variant), MIT license —
// github.com/microsoft/fluentui-emoji/blob/main/assets/Fire/Flat/fire_flat.svg
// (attribution lives in the app's credits, see AccountScreen). Two real,
// independently-drawn shapes — an outer glow and an inset licking flame —
// not one path reused twice at different scales.
const OUTER_PATH =
  'M26 19.3399C26 25.4393 20.9491 30.3451 14.8501 29.981C8.58145 29.6067 4.2892 23.5781 5.09774 17.2765C5.58685 13.4429 7.38361 10.1555 9.34008 7.6065C9.67947 7.16144 10.0288 10.7422 10.3782 10.3477C10.7276 9.94307 13.9717 4.32923 15.0997 2.35679C15.3093 1.99265 15.7884 1.88139 16.1278 2.14438C18.3937 3.85382 26 10.2769 26 19.3399Z';
const INNER_PATH =
  'M23 21.8512C23 25.893 19.4812 29.142 15.2011 28.9952C10.5815 28.8386 7.41254 24.6109 8.09159 20.256C9.06903 14.0124 15.4789 10 15.4789 10C15.4789 10 23 14.7072 23 21.8512Z';

// The inner flame's own base sits around (15.5, 29) in the 32x32 viewBox —
// anchoring the scale there keeps it rooted in place as it breathes, rather
// than drifting off-center the way scaling from the viewBox origin would.
const INNER_ANCHOR_X = 15.5;
const INNER_ANCHOR_Y = 29;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Two independent motions, out of phase, read as one organic flicker instead
 * of a single mechanical wobble: the whole glyph leans very slightly (native
 * driver, cheap), while the brighter inner flame separately pulses in height
 * and brightness. useNativeDriver: false for the inner pulse only — it
 * drives react-native-svg's own `transform`/`opacity` props on a Path, which
 * the native animated module's prop whitelist doesn't cover.
 *
 * enabled=false parks the value at rest rather than animating to a still
 * frame — an unlit flame shouldn't burn CPU either.
 */
function useLoop(duration: number, delay = 0, enabled = true, useNativeDriver = false) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay, enabled, useNativeDriver]);
  return value;
}

export default function FireIcon({ size = 14, style, lit = true }: FireIconProps) {
  const sway = useLoop(1400, 0, lit, true);
  const flicker = useLoop(620, 140, lit, false);
  const colors = lit ? LIT_COLORS : UNLIT_COLORS;

  const swayRotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });

  const flickerScaleY = flicker.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.05] });
  const flickerOpacity = flicker.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Animated.View style={[style, { transform: [{ rotate: swayRotate }] }]}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path fill={colors.outer} d={OUTER_PATH} />
        <AnimatedPath
          fill={colors.inner}
          d={INNER_PATH}
          opacity={flickerOpacity}
          transform={[
            { translateX: INNER_ANCHOR_X },
            { translateY: INNER_ANCHOR_Y },
            { scaleY: flickerScaleY },
            { translateX: -INNER_ANCHOR_X },
            { translateY: -INNER_ANCHOR_Y },
          ]}
        />
      </Svg>
    </Animated.View>
  );
}
