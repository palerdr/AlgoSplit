import type { ComponentType } from 'react';

// Resolve the native material once so Glass and popup transitions make the
// same availability decision on every platform and OS version.
let NativeLiquidGlassView: ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const glass = require('expo-glass-effect');
  if (glass.isLiquidGlassAvailable?.() && glass.isGlassEffectAPIAvailable?.()) {
    NativeLiquidGlassView = glass.GlassView;
  }
} catch {
  NativeLiquidGlassView = null;
}

export const LiquidGlassView = NativeLiquidGlassView;
export const liquidGlassAvailable = LiquidGlassView !== null;
