const OPENING_WHOOSH_SECONDS = 4;
const OPENING_WHOOSH_DROP = 0.06;

export interface RestDrainTiming {
  durationSeconds: number;
  totalMs: number;
  easing: (fraction: number) => number;
}

export type RestFinishReason = 'expired' | 'skipped';

/**
 * The real deadline wins over a nearly simultaneous hold-to-skip completion.
 * This keeps a rest that genuinely reached zero on the completion path even
 * when the 250 ms display tick has not observed the deadline yet.
 */
export function resolveRestFinishReason(
  requestedReason: RestFinishReason,
  nowMs: number,
  endsAtMs: number
): RestFinishReason {
  return nowMs >= endsAtMs ? 'expired' : requestedReason;
}

/**
 * Builds the water-drain curve for one rest interval.
 *
 * Longer rests begin with the same four-second, six-percent whoosh before
 * settling into a constant drain. Very short intervals use a linear curve;
 * forcing a six-percent opening drop there would actually make the water
 * move more slowly than real time.
 */
export function createRestDrainTiming(durationSeconds: number): RestDrainTiming {
  const seconds = Math.max(1, Math.round(durationSeconds));
  const totalMs = seconds * 1000;
  const openingFraction = Math.min(1, OPENING_WHOOSH_SECONDS / seconds);

  if (openingFraction >= OPENING_WHOOSH_DROP) {
    return {
      durationSeconds: seconds,
      totalMs,
      easing: (fraction) => Math.min(1, Math.max(0, fraction)),
    };
  }

  const steadySlope = (1 - OPENING_WHOOSH_DROP) / (1 - openingFraction);
  const startSlope = (2 * OPENING_WHOOSH_DROP) / openingFraction - steadySlope;
  const easing = (fraction: number): number => {
    const x = Math.min(1, Math.max(0, fraction));
    if (x <= openingFraction) {
      // The slope meets the steady phase continuously at the boundary.
      return (
        startSlope * x -
        ((startSlope - steadySlope) * x * x) / (2 * openingFraction)
      );
    }
    return OPENING_WHOOSH_DROP + steadySlope * (x - openingFraction);
  };

  return { durationSeconds: seconds, totalMs, easing };
}
