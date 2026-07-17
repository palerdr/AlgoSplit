import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

interface FireIconProps {
  /** Rendered height in points; width follows the glyph's square viewBox. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Lucide (ISC license, lucide.dev) "flame" glyph — a well-known, simple
// open-source icon set. Kept as raw path data rather than the
// lucide-react-native package: Lucide icons are single-color/stroke by
// design, and the two-tone fill + inset core below needed the path twice
// at different scales anyway, so there was nothing left for the package
// to do that react-native-svg (already a dependency) doesn't.
const FLAME_PATH =
  'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4';

export default function FireIcon({ size = 14, style }: FireIconProps) {
  // A gentle continuous flicker — scale + a few degrees of wobble — rather
  // than a heavier Lottie asset, which would add a native module for a
  // 14pt badge and has open Expo-Go/web compatibility gaps.
  const flicker = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);

  const scale = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotate = flicker.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] });

  return (
    <Animated.View style={[style, { transform: [{ scale }, { rotate }] }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path fill="#E8452A" d={FLAME_PATH} />
        <G transform="translate(6.2 9.5) scale(0.5)">
          <Path fill="#FFB238" d={FLAME_PATH} />
        </G>
      </Svg>
    </Animated.View>
  );
}
