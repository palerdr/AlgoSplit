import RestActivity from '../../modules/rest-activity';

interface RestLiveActivityTiming {
  startedAtMs: number;
  endsAtMs: number;
  nextUp: string | null;
}

// Keep native lifecycle operations ordered. This also prevents a very fast
// hold-to-skip from trying to end the activity before its start has finished.
let lifecycleQueue: Promise<void> = Promise.resolve();

function enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
  lifecycleQueue = lifecycleQueue.then(operation, operation).catch((error) => {
    // Live Activities are optional and can be disabled by the user. They must
    // never interrupt the workout or its in-app timer.
    if (__DEV__) console.warn('[AlgoSplit] Rest Live Activity unavailable.', error);
  });
  return lifecycleQueue;
}

/**
 * Starts the rest Live Activity. The native side owns everything else:
 * replacing stale activities, the staleDate-driven completion flip at the
 * deadline, and the scheduled completion alert.
 */
export function startRestLiveActivity({
  startedAtMs,
  endsAtMs,
  nextUp,
}: RestLiveActivityTiming): Promise<void> {
  return enqueueLifecycle(async () => {
    await RestActivity.start(startedAtMs, endsAtMs, nextUp);
  });
}

/** Flips the activity to "Time for your set" and alerts. */
export function completeRestLiveActivity(): Promise<void> {
  return enqueueLifecycle(async () => {
    await RestActivity.complete();
  });
}

/** Dismisses every rest activity immediately (skip, cancel, unmount). */
export function endRestLiveActivity(): Promise<void> {
  return enqueueLifecycle(async () => {
    await RestActivity.end();
  });
}
