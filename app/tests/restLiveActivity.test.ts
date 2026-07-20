import React, { type ReactElement } from 'react';

jest.mock('@use-voltra/ios-client', () => ({
  isLiveActivityActive: jest.fn(() => true),
  startLiveActivity: jest.fn(async () => 'algosplit-rest-timer'),
  stopLiveActivity: jest.fn(async () => undefined),
  updateLiveActivity: jest.fn(async () => undefined),
}));

jest.mock(
  '../src/workout/restAlarm',
  () => ({
    scheduleRestAlarm: jest.fn(async () => false),
    cancelRestAlarm: jest.fn(async () => undefined),
  }),
  { virtual: true }
);

jest.mock(
  '../src/workout/restCompletionAlert',
  () => ({ presentRestCompletionAlert: jest.fn(async () => undefined) }),
  { virtual: true }
);

import { Platform } from 'react-native';
import { renderLiveActivityToString } from '@use-voltra/ios';
import {
  isLiveActivityActive as nativeIsLiveActivityActive,
  startLiveActivity as nativeStartLiveActivity,
  stopLiveActivity as nativeStopLiveActivity,
  updateLiveActivity as nativeUpdateLiveActivity,
} from '@use-voltra/ios-client';
import { cancelRestAlarm, scheduleRestAlarm } from '../src/workout/restAlarm';
import { presentRestCompletionAlert } from '../src/workout/restCompletionAlert';
import {
  completeRestLiveActivity,
  createRestCompletionLiveActivityVariants,
  createRestLiveActivityVariants,
  endRestLiveActivity,
  startRestLiveActivity,
} from '../src/workout/restLiveActivity.ios';
import {
  completeRestLiveActivity as resolvedCompleteRestLiveActivity,
  endRestLiveActivity as resolvedEndRestLiveActivity,
  startRestLiveActivity as resolvedStartRestLiveActivity,
} from '../src/workout/restLiveActivity';

const mockIsLiveActivityActive = jest.mocked(nativeIsLiveActivityActive);
const mockStartLiveActivity = jest.mocked(nativeStartLiveActivity);
const mockStopLiveActivity = jest.mocked(nativeStopLiveActivity);
const mockUpdateLiveActivity = jest.mocked(nativeUpdateLiveActivity);
const mockScheduleRestAlarm = jest.mocked(scheduleRestAlarm);
const mockCancelRestAlarm = jest.mocked(cancelRestAlarm);
const mockPresentRestCompletionAlert = jest.mocked(presentRestCompletionAlert);

type TimerElement = ReactElement<{ startAtMs: number; endAtMs: number }>;

describe('rest Live Activity', () => {
  beforeEach(() => {
    expect(Platform.OS).toBe('ios');
    jest.clearAllMocks();
    mockIsLiveActivityActive.mockReturnValue(true);
    mockScheduleRestAlarm.mockResolvedValue(false);
  });

  it('uses one native deadline across the Lock Screen and Dynamic Island', async () => {
    const startedAtMs = 1_750_000_000_000;
    const endsAtMs = startedAtMs + 180_000;

    const variants = createRestLiveActivityVariants({
      startedAtMs,
      endsAtMs,
      nextUp: 'Romanian deadlift',
    });
    await startRestLiveActivity({ startedAtMs, endsAtMs, nextUp: 'Romanian deadlift' });

    expect(mockScheduleRestAlarm).toHaveBeenCalledWith({
      endsAtMs,
      nextWorkout: 'Romanian deadlift',
    });
    expect(mockStartLiveActivity).toHaveBeenCalledTimes(1);
    const [, options] = mockStartLiveActivity.mock.calls[0];
    expect(options).toEqual({
      activityName: 'algosplit-rest-timer',
      deepLinkUrl: 'algosplit://',
      staleDate: endsAtMs,
      relevanceScore: 1,
    });
    expect(variants.island?.compact?.leading).toBeUndefined();
    expect((variants.island?.compact?.trailing as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    expect((variants.island?.minimal as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const lockScreen = variants.lockScreen as {
      content: ReactElement<{ children: React.ReactNode }>;
    };
    const lockScreenChildren = React.Children.toArray(lockScreen.content.props.children);
    const lockScreenHeader = lockScreenChildren[0] as ReactElement<{
      children: React.ReactNode;
    }>;
    const lockScreenHeaderChildren = React.Children.toArray(lockScreenHeader.props.children);
    expect((lockScreenHeaderChildren[3] as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const payload = renderLiveActivityToString(variants);
    expect(payload).toContain(String(startedAtMs));
    expect(payload).toContain(String(endsAtMs));
    expect(payload).toContain('Next: Romanian deadlift');
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(4_096);
  });

  it('lets AlarmKit own the timer and leaves it armed at natural expiry', async () => {
    const endsAtMs = 1_750_000_180_000;
    mockScheduleRestAlarm.mockResolvedValueOnce(true);
    mockIsLiveActivityActive.mockReturnValue(false);

    await startRestLiveActivity({
      startedAtMs: endsAtMs - 180_000,
      endsAtMs,
      nextUp: 'Incline press',
    });
    await completeRestLiveActivity();

    expect(mockScheduleRestAlarm).toHaveBeenCalledWith({
      endsAtMs,
      nextWorkout: 'Incline press',
    });
    expect(mockStartLiveActivity).not.toHaveBeenCalled();
    expect(mockUpdateLiveActivity).not.toHaveBeenCalled();
    expect(mockPresentRestCompletionAlert).not.toHaveBeenCalled();
    expect(mockCancelRestAlarm).not.toHaveBeenCalled();

    // Test teardown: a real natural expiry intentionally leaves AlarmKit in
    // control until the user handles its system alert.
    await endRestLiveActivity();
  });

  it('cancels an AlarmKit timer when rest is skipped', async () => {
    mockScheduleRestAlarm.mockResolvedValueOnce(true);
    mockIsLiveActivityActive.mockReturnValue(false);

    await startRestLiveActivity({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: null,
    });
    await endRestLiveActivity();

    expect(mockCancelRestAlarm).toHaveBeenCalledTimes(1);
    expect(mockStartLiveActivity).not.toHaveBeenCalled();
    expect(mockStopLiveActivity).not.toHaveBeenCalled();
  });

  it('uses a linked completion layout and presents it as an alert', async () => {
    const variants = createRestCompletionLiveActivityVariants();
    const payload = renderLiveActivityToString(variants);

    expect(variants.island?.compact?.leading).toBeUndefined();
    expect(variants.island?.compact?.trailing).toBeDefined();
    expect(variants.island?.minimal).toBeDefined();
    expect(payload).toContain('Rest complete');
    expect(payload).toContain('Back to workout');
    expect(payload).toContain('algosplit://');
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(4_096);

    await completeRestLiveActivity();

    expect(mockUpdateLiveActivity).toHaveBeenCalledWith(
      'algosplit-rest-timer',
      expect.any(Object),
      { relevanceScore: 1 }
    );
    expect(mockPresentRestCompletionAlert).toHaveBeenCalledTimes(1);
    expect(mockStopLiveActivity).not.toHaveBeenCalled();
    expect(mockUpdateLiveActivity.mock.invocationCallOrder[0]).toBeLessThan(
      mockPresentRestCompletionAlert.mock.invocationCallOrder[0]
    );
  });

  it('uses a useful Lock Screen fallback when there is no next exercise', () => {
    const variants = createRestLiveActivityVariants({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: null,
    });

    expect(renderLiveActivityToString(variants)).toContain('Next: Continue workout');
  });

  it('resolves the public iOS module to the native implementation', async () => {
    const startedAtMs = 1_750_000_000_000;
    const endsAtMs = startedAtMs + 180_000;

    await resolvedStartRestLiveActivity({ startedAtMs, endsAtMs, nextUp: 'Bench press' });
    await resolvedCompleteRestLiveActivity();
    await resolvedEndRestLiveActivity();

    expect(mockStartLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockUpdateLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockPresentRestCompletionAlert).toHaveBeenCalledTimes(1);
    expect(mockStopLiveActivity).toHaveBeenCalledWith('algosplit-rest-timer', {
      dismissalPolicy: 'immediate',
    });
  });

  it('dismisses the named activity immediately', async () => {
    await endRestLiveActivity();

    expect(mockIsLiveActivityActive).toHaveBeenCalledWith('algosplit-rest-timer');
    expect(mockStopLiveActivity).toHaveBeenCalledWith('algosplit-rest-timer', {
      dismissalPolicy: 'immediate',
    });
  });

  it('queues completion behind a start that is still pending', async () => {
    let finishStart!: (activityName: string) => void;
    mockStartLiveActivity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        })
    );

    const starting = startRestLiveActivity({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: 'Cable row',
    });
    await Promise.resolve();
    await Promise.resolve();
    const completing = completeRestLiveActivity();

    expect(mockUpdateLiveActivity).not.toHaveBeenCalled();
    expect(mockPresentRestCompletionAlert).not.toHaveBeenCalled();
    finishStart('algosplit-rest-timer');
    await Promise.all([starting, completing]);

    expect(mockUpdateLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockPresentRestCompletionAlert).toHaveBeenCalledTimes(1);
  });

  it('queues an immediate end behind a start that is still pending', async () => {
    let finishStart!: (activityName: string) => void;
    mockStartLiveActivity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        })
    );

    const starting = startRestLiveActivity({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: null,
    });
    await Promise.resolve();
    await Promise.resolve();
    const ending = endRestLiveActivity();

    expect(mockIsLiveActivityActive).not.toHaveBeenCalled();
    finishStart('algosplit-rest-timer');
    await Promise.all([starting, ending]);

    expect(mockStopLiveActivity).toHaveBeenCalledWith('algosplit-rest-timer', {
      dismissalPolicy: 'immediate',
    });
  });
});
