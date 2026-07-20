export function scheduleRestCompletionAlert(
  _endsAtMs: number,
  _completionJson: string
): Promise<boolean> {
  return Promise.resolve(false);
}

export function cancelScheduledRestCompletionAlert(): Promise<boolean> {
  return Promise.resolve(true);
}

export function presentRestCompletionAlert(): Promise<void> {
  return Promise.resolve();
}
