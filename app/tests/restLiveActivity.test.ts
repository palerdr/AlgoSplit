import React, { type ReactElement } from 'react';

jest.mock('@use-voltra/ios-client', () => ({
  isLiveActivityActive: jest.fn(() => true),
  startLiveActivity: jest.fn(async () => 'algosplit-rest-timer'),
  stopLiveActivity: jest.fn(async () => undefined),
  updateLiveActivity: jest.fn(async () => undefined),
}));

jest.mock(
  '../src/workout/restCompletionAlert',
  () => ({
    cancelScheduledRestCompletionAlert: jest.fn(async () => true),
    presentRestCompletionAlert: jest.fn(async () => undefined),
    scheduleRestCompletionAlert: jest.fn(async () => false),
  }),
  { virtual: true }
);

import { Platform } from 'react-native';
import { Voltra, renderLiveActivityToString } from '@use-voltra/ios';
import {
  isLiveActivityActive as nativeIsLiveActivityActive,
  startLiveActivity as nativeStartLiveActivity,
  stopLiveActivity as nativeStopLiveActivity,
  updateLiveActivity as nativeUpdateLiveActivity,
} from '@use-voltra/ios-client';
import {
  cancelScheduledRestCompletionAlert,
  presentRestCompletionAlert,
  scheduleRestCompletionAlert,
} from '../src/workout/restCompletionAlert';
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
const mockCancelScheduledRestCompletionAlert = jest.mocked(
  cancelScheduledRestCompletionAlert
);
const mockPresentRestCompletionAlert = jest.mocked(presentRestCompletionAlert);
const mockScheduleRestCompletionAlert = jest.mocked(scheduleRestCompletionAlert);

type TimerElement = ReactElement<{ startAtMs: number; endAtMs: number }>;

describe('rest Live Activity', () => {
  beforeEach(() => {
    expect(Platform.OS).toBe('ios');
    jest.clearAllMocks();
    mockIsLiveActivityActive.mockReturnValue(true);
    mockCancelScheduledRestCompletionAlert.mockResolvedValue(true);
    mockScheduleRestCompletionAlert.mockResolvedValue(false);
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

    expect(mockStartLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledRestCompletionAlert).toHaveBeenCalledTimes(1);
    expect(mockScheduleRestCompletionAlert).toHaveBeenCalledWith(
      endsAtMs,
      expect.stringContaining('Time for your set')
    );
    const [, options] = mockStartLiveActivity.mock.calls[0];
    expect(options).toEqual({
      activityName: 'algosplit-rest-timer',
      deepLinkUrl: 'algosplit://',
      staleDate: endsAtMs,
      relevanceScore: 0.8,
    });
    expect(variants.island?.compact?.leading).toBeUndefined();
    const compactCountdown = variants.island?.compact?.trailing as TimerElement;
    expect(compactCountdown.type).toBe(Voltra.Timer);
    expect(compactCountdown.props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const minimal = variants.island?.minimal as ReactElement<{
      name: string;
      tintColor: string;
    }>;
    expect(minimal.type).toBe(Voltra.Symbol);
    expect(minimal.props).toMatchObject({
      name: 'timer',
      tintColor: '#41C46E',
    });
    const lockScreen = variants.lockScreen as {
      content: ReactElement<{ children: React.ReactNode }>;
    };
    const lockScreenChildren = React.Children.toArray(lockScreen.content.props.children);
    const timerColumn = lockScreenChildren[0] as ReactElement<{
      children: React.ReactNode;
    }>;
    const timerColumnChildren = React.Children.toArray(timerColumn.props.children);
    expect((timerColumnChildren[1] as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const payload = renderLiveActivityToString(variants);
    expect(payload).toContain(String(startedAtMs));
    expect(payload).toContain(String(endsAtMs));
    expect(payload).toContain('NEXT SET');
    expect(payload).toContain('Romanian deadlift');
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(4_096);
  });

  it('uses a linked completion layout and presents it as an alert', async () => {
    const variants = createRestCompletionLiveActivityVariants();
    const payload = renderLiveActivityToString(variants);

    expect(variants.island?.compact?.leading).toBeUndefined();
    expect(variants.island?.compact?.trailing).toBeDefined();
    expect(variants.island?.minimal).toBeDefined();
    expect(payload).toContain('Time for your set');
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

  it('cancels the scheduled fallback when the foreground timer completes', async () => {
    mockScheduleRestCompletionAlert.mockResolvedValueOnce(true);
    await startRestLiveActivity({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: 'Cable row',
    });

    await completeRestLiveActivity();

    expect(mockUpdateLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledRestCompletionAlert).toHaveBeenCalledTimes(2);
    expect(mockPresentRestCompletionAlert).toHaveBeenCalledTimes(1);
  });

  it('still presents the foreground alert if completion races the scheduled activity', async () => {
    mockCancelScheduledRestCompletionAlert.mockResolvedValueOnce(false);

    await completeRestLiveActivity();

    expect(mockUpdateLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockPresentRestCompletionAlert).toHaveBeenCalledTimes(1);
  });

  it('uses a useful Lock Screen fallback when there is no next exercise', () => {
    const variants = createRestLiveActivityVariants({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: null,
    });

    const payload = renderLiveActivityToString(variants);
    expect(payload).toContain('NEXT SET');
    expect(payload).toContain('Continue workout');
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

    expect(mockCancelScheduledRestCompletionAlert).toHaveBeenCalledTimes(1);
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
