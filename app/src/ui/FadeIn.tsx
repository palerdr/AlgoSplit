import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

// Staggered entrance: settle up on mount. Transform-only — animating opacity
// over GlassView children breaks the iOS glass effect, sometimes permanently.
export default function FadeIn({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 360,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [a, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
