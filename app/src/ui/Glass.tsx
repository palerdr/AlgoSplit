import React, { ReactNode, useContext } from 'react';
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LiquidGlassView } from './GlassRuntime';
import { PopupGlassTransitionContext } from './PopupGlassTransition';

interface GlassProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Subtle color wash over the glass */
  tintColor?: string;
  /** Native touch shimmer on iOS liquid glass */
  interactive?: boolean;
}

export default function Glass({ style, children, tintColor, interactive }: GlassProps) {
  const popupTransition = useContext(PopupGlassTransitionContext);
  if (LiquidGlassView) {
    const resolvedStyle = StyleSheet.flatten(style);
    const popupBorder =
      popupTransition && resolvedStyle?.borderWidth
        ? ({
            borderColor: resolvedStyle.borderColor,
            borderCurve: resolvedStyle.borderCurve,
            borderRadius: resolvedStyle.borderRadius,
            borderStyle: resolvedStyle.borderStyle,
            borderWidth: resolvedStyle.borderWidth,
          } satisfies ViewStyle)
        : null;

    return (
      <LiquidGlassView
        style={[style, popupBorder && styles.hiddenPopupBorder]}
        glassEffectStyle={
          popupTransition
            ? {
                style: popupTransition.active ? 'regular' : 'none',
                animate: true,
                animationDuration: popupTransition.durationSeconds,
              }
            : 'regular'
        }
        tintColor={tintColor}
        isInteractive={interactive}
      >
        {children}
        {popupBorder && popupTransition && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.popupBorder,
              popupBorder,
              { opacity: popupTransition.progress },
            ]}
          />
        )}
      </LiquidGlassView>
    );
  }
  return (
    <BlurView intensity={35} tint="dark" style={[{ overflow: 'hidden' }, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  hiddenPopupBorder: {
    borderColor: 'transparent',
  },
  popupBorder: {
    ...StyleSheet.absoluteFillObject,
  },
});
