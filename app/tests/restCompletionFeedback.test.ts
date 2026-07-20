jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  impactAsync: jest.fn(async () => undefined),
}));

import * as Haptics from 'expo-haptics';
import {
  playRestCompletionHaptics,
  REST_COMPLETION_HAPTIC_GAP_MS,
} from '../src/workout/restCompletionFeedback';

const mockImpactAsync = jest.mocked(Haptics.impactAsync);

describe('rest completion feedback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays two short medium pulses separated by a small gap', async () => {
    const feedback = playRestCompletionHaptics();
    await Promise.resolve();

    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Medium);

    jest.advanceTimersByTime(REST_COMPLETION_HAPTIC_GAP_MS);
    await feedback;

    expect(mockImpactAsync).toHaveBeenCalledTimes(2);
    expect(mockImpactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });
});
