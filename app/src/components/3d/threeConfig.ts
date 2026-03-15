export const BODY_3D_CONFIG = {
  interaction: {
    horizontalDragThreshold: 5,
    tapThreshold: 6,
    dragSensitivity: 0.006,
    maxReleaseVelocity: 0.2,
    inertiaDecay: 0.95,
    minInertiaVelocity: 0.0001,
  },
  camera: {
    fov: 35,
    near: 0.1,
    far: 100,
    position: [0, 0, 5] as const,
  },
  model: {
    maxDimension: 2.56,
    tiltX: 0.08,
    offsetX: -0.03,
    offsetY: 0.03,
  },
  render: {
    clearColorHex: 0x0d0d0d,
  },
  lighting: {
    ambientIntensity: 1.05,
    directional: [
      { intensity: 1.45, position: [3, 4, 5] as const },
      { intensity: 0.95, position: [-4, 1, 3] as const },
      { intensity: 0.75, position: [-2, 3, -2] as const },
      { intensity: 0.45, position: [0, -3, 2] as const },
      { intensity: 0.55, position: [1, 0, -4] as const },
    ],
  },
} as const;
