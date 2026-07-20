interface RestLiveActivityTiming {
  startedAtMs: number;
  endsAtMs: number;
  nextUp: string | null;
}

// Live Activities are an iOS system surface. Android and web keep using the
// existing full-screen timer without loading any iOS-only runtime code.
export function startRestLiveActivity(_timing: RestLiveActivityTiming): Promise<void> {
  return Promise.resolve();
}

export function completeRestLiveActivity(): Promise<void> {
  return Promise.resolve();
}

export function endRestLiveActivity(): Promise<void> {
  return Promise.resolve();
}
