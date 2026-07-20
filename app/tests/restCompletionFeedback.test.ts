jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));

import * as Haptics from 'expo-haptics';
import {
  playRestCompletionHaptics,
  REST_COMPLETION_HAPTIC_GAP_MS,
} from '../src/workout/restCompletionFeedback';

const mockImpactAsync = jest.mocked(Haptics.impactAsync);
const mockNotificationAsync = jest.mocked(Haptics.notificationAsync);

describe('rest completion feedback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays a success haptic followed by a short medium pulse', async () => {
    const feedback = playRestCompletionHaptics();
    await Promise.resolve();

    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success
    );
    expect(mockImpactAsync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(REST_COMPLETION_HAPTIC_GAP_MS);
    await feedback;

    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });
});
