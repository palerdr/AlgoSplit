import React, { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

// Native iOS 26 liquid glass when available, frosted blur everywhere else.
// expo-glass-effect is resolved lazily so a runtime without the native module
// (Android, older iOS) cleanly falls back instead of crashing at import.
let LiquidGlassView: React.ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const glass = require('expo-glass-effect');
  if (glass.isLiquidGlassAvailable?.()) {
    LiquidGlassView = glass.GlassView;
  }
} catch {
  LiquidGlassView = null;
}

interface GlassProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Subtle color wash over the glass */
  tintColor?: string;
  /** Native touch shimmer on iOS liquid glass */
  interactive?: boolean;
}

export default function Glass({ style, children, tintColor, interactive }: GlassProps) {
  if (LiquidGlassView) {
    return (
      <LiquidGlassView
        style={style}
        glassEffectStyle="regular"
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
