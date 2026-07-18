import React, { ReactNode, useContext } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { liquidGlassAvailable } from './GlassRuntime';
import { PopupGlassTransitionContext } from './PopupGlassTransition';

/**
 * Fades popup content from inside its GlassView. This is safe because opacity
 * is never applied to Liquid Glass itself or one of its ancestors.
 */
export default function PopupContent({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const transition = useContext(PopupGlassTransitionContext);
  return (
    <Animated.View
      style={[
        style,
        transition && liquidGlassAvailable ? { opacity: transition.progress } : null,
      ]}
    >
      {children}
    </Animated.View>
  );
}
