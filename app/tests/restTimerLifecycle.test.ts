jest.mock('../src/workout/restLiveActivity', () => ({
  completeRestLiveActivity: jest.fn(async () => undefined),
  endRestLiveActivity: jest.fn(async () => undefined),
  startRestLiveActivity: jest.fn(async () => undefined),
}));

jest.mock('../src/workout/restCompletionFeedback', () => ({
  playRestCompletionHaptics: jest.fn(async () => undefined),
}));

jest.mock('../src/state/AppState', () => ({ REST_SECONDS: 180 }));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const immediateAnimation = () => ({
    start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }),
    stop: jest.fn(),
  });

  native.Animated.loop = jest.fn(immediateAnimation);
  native.Animated.spring = jest.fn(immediateAnimation);
  native.Animated.timing = jest.fn(immediateAnimation);
  return native;
});

import React from 'react';
import * as Haptics from 'expo-haptics';
import {
  completeRestLiveActivity,
  endRestLiveActivity,
  startRestLiveActivity,
} from '../src/workout/restLiveActivity';
import { playRestCompletionHaptics } from '../src/workout/restCompletionFeedback';
import RestTimer from '../src/screens/RestTimer';

const TestRenderer = require('react-test-renderer');
const mockCompleteRestLiveActivity = jest.mocked(completeRestLiveActivity);
const mockEndRestLiveActivity = jest.mocked(endRestLiveActivity);
const mockStartRestLiveActivity = jest.mocked(startRestLiveActivity);
const mockPlayRestCompletionHaptics = jest.mocked(playRestCompletionHaptics);
const mockSelectionAsync = jest.mocked(Haptics.selectionAsync);
const mockNotificationAsync = jest.mocked(Haptics.notificationAsync);

describe('RestTimer Live Activity lifecycle', () => {
  let nowMs = 1_000;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    nowMs = 1_000;
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    jest.useRealTimers();
  });

  it('preserves the completion activity when a naturally expired overlay unmounts', () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(RestTimer, {
          nextUp: 'Bench press',
          durationSeconds: 1,
          onDone: jest.fn(),
        })
      );
    });

    nowMs = 2_000;
    TestRenderer.act(() => {
      jest.advanceTimersByTime(250);
    });
    TestRenderer.act(() => renderer!.unmount());

    expect(mockStartRestLiveActivity).toHaveBeenCalledWith({
      startedAtMs: 1_000,
      endsAtMs: 2_000,
      nextUp: 'Bench press',
    });
    expect(mockCompleteRestLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockPlayRestCompletionHaptics).toHaveBeenCalledTimes(1);
    expect(mockEndRestLiveActivity).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('ends an active Live Activity on an unexpected unmount', () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(RestTimer, { nextUp: null, onDone: jest.fn() })
      );
    });
    TestRenderer.act(() => renderer!.unmount());

    expect(mockEndRestLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockCompleteRestLiveActivity).not.toHaveBeenCalled();
    expect(mockPlayRestCompletionHaptics).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('ends a held-to-skip activity with success haptics but no expiry feedback', () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(RestTimer, { nextUp: 'Cable row', onDone: jest.fn() })
      );
    });

    const holdArea = renderer!.root.find((node: { props: Record<string, unknown> }) =>
      Boolean(node.props.onPressIn)
    );
    TestRenderer.act(() => holdArea.props.onPressIn());
    TestRenderer.act(() => renderer!.unmount());

    expect(mockEndRestLiveActivity).toHaveBeenCalledTimes(1);
    expect(mockCompleteRestLiveActivity).not.toHaveBeenCalled();
    expect(mockPlayRestCompletionHaptics).not.toHaveBeenCalled();
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success
    );
  });
});
