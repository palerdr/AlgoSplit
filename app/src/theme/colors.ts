export const colors = {
  // Backgrounds
  bg: '#0D0D0D',
  surface: '#141414',
  surfaceElevated: '#1A1A1A',

  // Borders
  border: '#1E1E1E',
  borderLight: '#2A2A2A',

  // Text
  text: '#E8E8E8',
  textSecondary: '#888888',
  textMuted: '#666666',
  textDim: '#555555',

  // Accent
  green: '#4ADE80',
  greenEnd: '#22C55E',
  greenMuted: 'rgba(74, 222, 128, 0.15)',

  // Status
  red: '#EF4444',
  redMuted: 'rgba(239, 68, 68, 0.15)',
  yellow: '#FACC15',
  yellowMuted: 'rgba(250, 204, 21, 0.15)',
  blue: '#60A5FA',

  // Stimulus heatmap scale (0-7), anchored to the engine's real net_stimulus
  // range (~0–2.75). See src/analysis/stimulusScale.ts for the thresholds.
  // Cool (no growth) → deepening green (optimal), perceptually spaced so
  // adjacent levels stay distinguishable on a phone.
  stimulus: [
    '#3A3D44', // 0 - maintaining or below (cold / no growth)
    '#2E5E86', // 1 - minimal (cool blue)
    '#1C8C8F', // 2 - low (teal)
    '#5FD07A', // 3 - building (light green)
    '#43C266', // 4 - moderate
    '#2FAE52', // 5 - good
    '#1F9444', // 6 - high (rich green)
    '#137A36', // 7 - optimal (deep forest green)
  ] as const,

  // Transparent
  transparent: 'transparent',
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof colors;
