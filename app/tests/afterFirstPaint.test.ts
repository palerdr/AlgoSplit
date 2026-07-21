import { scheduleAfterFirstPaint } from '../src/ui/afterFirstPaint';

describe('scheduleAfterFirstPaint', () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  const flushFrame = () => {
    const pending = Array.from(callbacks.values());
    callbacks.clear();
    pending.forEach((callback) => callback(0));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = new Map();
    nextFrameId = 1;
    global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++;
      callbacks.set(frameId, callback);
      return frameId;
    });
    global.cancelAnimationFrame = jest.fn((frameId: number) => {
      callbacks.delete(frameId);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('runs after two animation frames', () => {
    const task = jest.fn();

    scheduleAfterFirstPaint(task);
    flushFrame();
    expect(task).not.toHaveBeenCalled();

    flushFrame();
    expect(task).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(250);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back when animation frames do not run', () => {
    const task = jest.fn();

    scheduleAfterFirstPaint(task);
    jest.advanceTimersByTime(249);
    expect(task).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);

    flushFrame();
    flushFrame();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('cancels both frame and fallback execution', () => {
    const task = jest.fn();
    const cancel = scheduleAfterFirstPaint(task);

    flushFrame();
    cancel();
    flushFrame();
    jest.advanceTimersByTime(250);

    expect(task).not.toHaveBeenCalled();
  });
});
