jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { render } from '@testing-library/react-native';
import StimulusLegend from '../src/components/shared/StimulusLegend';
import {
  getStimulusLevel,
  stimulusAdequacy,
  STIMULUS_THRESHOLDS,
  MAX_STIMULUS_LEVEL,
} from '../src/analysis/stimulusScale';

describe('StimulusLegend', () => {
  it('renders without crashing and shows every band label', () => {
    const { getByText } = render(<StimulusLegend />);
    expect(getByText('Maintain')).toBeTruthy();
    expect(getByText('Building')).toBeTruthy();
    expect(getByText('Growing')).toBeTruthy();
    expect(getByText('Optimal')).toBeTruthy();
  });

  it('accepts an explicit width prop without crashing', () => {
    expect(() => render(<StimulusLegend width={240} />)).not.toThrow();
  });
});

describe('stimulus scale defensive guards', () => {
  // The dial+map render on every analysis response. A malformed value must
  // never crash the screen — these tests pin the documented fallback to 0.
  it('handles non-finite inputs without throwing', () => {
    // @ts-expect-error — runtime safety check for malformed payloads
    expect(getStimulusLevel(undefined)).toBe(0);
    // @ts-expect-error
    expect(getStimulusLevel(null)).toBe(0);
    expect(getStimulusLevel(NaN)).toBe(0);
    // Non-finite (Infinity / -Infinity) is treated as malformed and falls back
    // to level 0 so a corrupt payload renders neutrally instead of locking the
    // body at saturation.
    expect(getStimulusLevel(Infinity)).toBe(0);
    expect(getStimulusLevel(-Infinity)).toBe(0);

    expect(stimulusAdequacy(NaN)).toBe(0);
  });

  it('maps every threshold boundary to the expected level (inclusive on upper bound)', () => {
    // Net == 0 → level 0; tiny positive → level 1; threshold values themselves
    // belong to the lower band, not the next one up.
    expect(getStimulusLevel(0)).toBe(0);
    expect(getStimulusLevel(0.0001)).toBe(1);
    for (let level = 1; level < STIMULUS_THRESHOLDS.length; level++) {
      const upper = STIMULUS_THRESHOLDS[level];
      expect(getStimulusLevel(upper)).toBe(level);
      expect(getStimulusLevel(upper + 0.0001)).toBe(level + 1);
    }
    expect(getStimulusLevel(100)).toBe(MAX_STIMULUS_LEVEL);
  });
});
