import { createRestDrainTiming } from '../src/workout/restTiming';

describe('createRestDrainTiming', () => {
  it('derives independent total durations for standard and warmup rests', () => {
    const standard = createRestDrainTiming(180);
    const warmup = createRestDrainTiming(90);

    expect(standard.durationSeconds).toBe(180);
    expect(standard.totalMs).toBe(180_000);
    expect(warmup.durationSeconds).toBe(90);
    expect(warmup.totalMs).toBe(90_000);
  });

  it('keeps the opening whoosh tied to four real seconds per interval', () => {
    const standard = createRestDrainTiming(180);
    const warmup = createRestDrainTiming(90);

    expect(standard.easing(4 / 180)).toBeCloseTo(0.06, 8);
    expect(warmup.easing(4 / 90)).toBeCloseTo(0.06, 8);
  });

  it('clamps the curve and uses a safe linear drain for short intervals', () => {
    const short = createRestDrainTiming(10);

    expect(short.easing(-1)).toBe(0);
    expect(short.easing(0.5)).toBe(0.5);
    expect(short.easing(2)).toBe(1);
  });
});
