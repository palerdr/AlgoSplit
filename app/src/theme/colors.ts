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
  // Perceptually-spaced cold→hot ramp so adjacent levels stay distinguishable.
  stimulus: [
    '#3A3D44', // 0 - maintaining or below (cold / no growth)
    '#2D5E8A', // 1 - minimal
    '#1F8FA0', // 2 - low
    '#1AA66B', // 3 - building
    '#43BE3F', // 4 - moderate
    '#7FD42E', // 5 - good
    '#B4E61E', // 6 - high
    '#E8F034', // 7 - optimal
  ] as const,

  // Transparent
  transparent: 'transparent',
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof colors;
