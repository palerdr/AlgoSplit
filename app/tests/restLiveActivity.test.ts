jest.mock('../modules/rest-activity', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async () => true),
    complete: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
  },
}));

import { Platform } from 'react-native';
import RestActivity from '../modules/rest-activity';
import {
  completeRestLiveActivity,
  endRestLiveActivity,
  startRestLiveActivity,
} from '../src/workout/restLiveActivity.ios';
import {
  completeRestLiveActivity as resolvedCompleteRestLiveActivity,
  endRestLiveActivity as resolvedEndRestLiveActivity,
  startRestLiveActivity as resolvedStartRestLiveActivity,
} from '../src/workout/restLiveActivity';

const mockStart = jest.mocked(RestActivity.start);
const mockComplete = jest.mocked(RestActivity.complete);
const mockEnd = jest.mocked(RestActivity.end);

describe('rest Live Activity', () => {
  beforeEach(() => {
    expect(Platform.OS).toBe('ios');
    jest.clearAllMocks();
  });

  it('passes the rest window and next exercise straight to the native module', async () => {
    const startedAtMs = 1_750_000_000_000;
    const endsAtMs = startedAtMs + 180_000;

    await startRestLiveActivity({ startedAtMs, endsAtMs, nextUp: 'Romanian deadlift' });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(startedAtMs, endsAtMs, 'Romanian deadlift');
  });

  it('passes a null next exercise through unchanged', async () => {
    await startRestLiveActivity({ startedAtMs: 1_000, endsAtMs: 181_000, nextUp: null });

    expect(mockStart).toHaveBeenCalledWith(1_000, 181_000, null);
  });

  it('completes without ending so the activity stays until the user returns', async () => {
    await completeRestLiveActivity();

    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('ends the activity on skip or unmount', async () => {
    await endRestLiveActivity();

    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('resolves the public iOS module to the native implementation', async () => {
    await resolvedStartRestLiveActivity({
      startedAtMs: 1_000,
      endsAtMs: 181_000,
      nextUp: 'Bench press',
    });
    await resolvedCompleteRestLiveActivity();
    await resolvedEndRestLiveActivity();

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the native module is unavailable', async () => {
    mockStart.mockRejectedValueOnce(new Error('Live Activities disabled'));
    mockComplete.mockRejectedValueOnce(new Error('Live Activities disabled'));
    mockEnd.mockRejectedValueOnce(new Error('Live Activities disabled'));

    await expect(
      startRestLiveActivity({ startedAtMs: 1_000, endsAtMs: 181_000, nextUp: null })
    ).resolves.toBeUndefined();
    await expect(completeRestLiveActivity()).resolves.toBeUndefined();
    await expect(endRestLiveActivity()).resolves.toBeUndefined();
  });

  it('queues completion behind a start that is still pending', async () => {
    let finishStart!: (started: boolean) => void;
    mockStart.mockImplementationOnce(
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

    expect(mockComplete).not.toHaveBeenCalled();
    finishStart(true);
    await Promise.all([starting, completing]);

    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('queues an immediate end behind a start that is still pending', async () => {
    let finishStart!: (started: boolean) => void;
    mockStart.mockImplementationOnce(
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

    expect(mockEnd).not.toHaveBeenCalled();
    finishStart(true);
    await Promise.all([starting, ending]);

    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps the queue alive after a failed operation', async () => {
    mockStart.mockRejectedValueOnce(new Error('throttled'));

    await startRestLiveActivity({ startedAtMs: 1_000, endsAtMs: 181_000, nextUp: null });
    await completeRestLiveActivity();

    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});
