export { colors } from './colors';
export { spacing } from './spacing';
export { typography } from './typography';
export { borders } from './borders';

// Animation presets
export const animations = {
  spring: {
    gentle: { damping: 22, stiffness: 180 },
    snappy: { damping: 15, stiffness: 300 },
    bouncy: { damping: 12, stiffness: 250 },
  },
  timing: {
    fast: 150,
    normal: 250,
    slow: 400,
  },
} as const;
