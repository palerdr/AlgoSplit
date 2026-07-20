import React, { type ReactElement } from 'react';

jest.mock('@use-voltra/ios-client', () => ({
  isLiveActivityActive: jest.fn(() => true),
  startLiveActivity: jest.fn(async () => 'algosplit-rest-timer'),
  stopLiveActivity: jest.fn(async () => undefined),
}));

import { Platform } from 'react-native';
import { renderLiveActivityToString } from '@use-voltra/ios';
import {
  isLiveActivityActive as nativeIsLiveActivityActive,
  startLiveActivity as nativeStartLiveActivity,
  stopLiveActivity as nativeStopLiveActivity,
} from '@use-voltra/ios-client';
import {
  createRestLiveActivityVariants,
  endRestLiveActivity,
  startRestLiveActivity,
} from '../src/workout/restLiveActivity.ios';
import {
  endRestLiveActivity as resolvedEndRestLiveActivity,
  startRestLiveActivity as resolvedStartRestLiveActivity,
} from '../src/workout/restLiveActivity';

const mockIsLiveActivityActive = jest.mocked(nativeIsLiveActivityActive);
const mockStartLiveActivity = jest.mocked(nativeStartLiveActivity);
const mockStopLiveActivity = jest.mocked(nativeStopLiveActivity);

type TimerElement = ReactElement<{ startAtMs: number; endAtMs: number }>;

describe('rest Live Activity', () => {
  beforeEach(() => {
    expect(Platform.OS).toBe('ios');
    jest.clearAllMocks();
    mockIsLiveActivityActive.mockReturnValue(true);
  });

  it('uses one native deadline across the Lock Screen and Dynamic Island', async () => {
    const startedAtMs = 1_750_000_000_000;
    const endsAtMs = startedAtMs + 180_000;

    const variants = createRestLiveActivityVariants({ startedAtMs, endsAtMs });
    await startRestLiveActivity({ startedAtMs, endsAtMs });

    expect(mockStartLiveActivity).toHaveBeenCalledTimes(1);
    const [, options] = mockStartLiveActivity.mock.calls[0];
    expect(options).toEqual({
      activityName: 'algosplit-rest-timer',
      deepLinkUrl: 'algosplit://',
      staleDate: endsAtMs,
      relevanceScore: 1,
    });
    expect((variants.island?.compact?.trailing as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    expect((variants.island?.minimal as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const lockScreen = variants.lockScreen as { content: ReactElement<{ children: React.ReactNode }> };
    const lockScreenChildren = React.Children.toArray(lockScreen.content.props.children);
    expect((lockScreenChildren[3] as TimerElement).props).toMatchObject({
      startAtMs: startedAtMs,
      endAtMs: endsAtMs,
    });
    const payload = renderLiveActivityToString(variants);
    expect(payload).toContain(String(startedAtMs));
    expect(payload).toContain(String(endsAtMs));
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(4_096);
  });

  it('resolves the public iOS module to the native implementation', async () => {
    const startedAtMs = 1_750_000_000_000;
    const endsAtMs = startedAtMs + 180_000;

    await resolvedStartRestLiveActivity({ startedAtMs, endsAtMs });
    await resolvedEndRestLiveActivity();

    expect(mockStartLiveActivity).toHaveBeenCalledTimes(1);
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

  it('queues an immediate end behind a start that is still pending', async () => {
    let finishStart!: (activityName: string) => void;
    mockStartLiveActivity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        })
    );

    const starting = startRestLiveActivity({ startedAtMs: 1_000, endsAtMs: 181_000 });
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
