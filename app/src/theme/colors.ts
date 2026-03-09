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

  // Stimulus heatmap scale (0-7)
  stimulus: [
    '#1A1A2E', // 0 - none
    '#16213E', // 1 - minimal
    '#0F3460', // 2 - low
    '#1A5276', // 3 - below maintenance
    '#2E86AB', // 4 - maintenance
    '#4ADE80', // 5 - moderate
    '#22C55E', // 6 - good
    '#16A34A', // 7 - optimal
  ] as const,

  // Transparent
  transparent: 'transparent',
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof colors;
