const FIRST_PAINT_FALLBACK_MS = 250;

/**
 * Defer optional work long enough for the current shell to paint, but never
 * leave required background refreshes waiting on an unbounded interaction.
 */
export function scheduleAfterFirstPaint(task: () => void): () => void {
  let cancelled = false;
  let completed = false;
  let secondFrame: number | null = null;
  let fallback: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (cancelled || completed) return;
    completed = true;
    if (fallback !== null) clearTimeout(fallback);
    task();
  };

  const firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(run);
  });
  fallback = setTimeout(run, FIRST_PAINT_FALLBACK_MS);

  return () => {
    cancelled = true;
    cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    if (fallback !== null) clearTimeout(fallback);
  };
}
