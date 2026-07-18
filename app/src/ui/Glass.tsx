import React, { ReactNode, useContext } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
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
    return (
      <LiquidGlassView
        style={style}
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
      </LiquidGlassView>
    );
  }
  return (
    <BlurView intensity={35} tint="dark" style={[{ overflow: 'hidden' }, style]}>
      {children}
    </BlurView>
  );
}
