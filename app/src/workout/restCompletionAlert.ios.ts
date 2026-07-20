import RestCompletionAlertModule from '../../modules/rest-completion-alert';

export async function scheduleRestCompletionAlert(
  endsAtMs: number,
  completionJson: string
): Promise<boolean> {
  try {
    return await RestCompletionAlertModule.schedule(endsAtMs, completionJson);
  } catch (error) {
    // Scheduled Live Activities are an iOS 26 enhancement. The foreground
    // completion path remains available on older versions and on failure.
    if (__DEV__) console.warn('[AlgoSplit] Could not schedule the rest completion.', error);
    return false;
  }
}

export async function cancelScheduledRestCompletionAlert(): Promise<boolean> {
  try {
    return await RestCompletionAlertModule.cancelScheduled();
  } catch (error) {
    if (__DEV__) console.warn('[AlgoSplit] Could not cancel the rest completion.', error);
    return false;
  }
}

export async function presentRestCompletionAlert(): Promise<void> {
  try {
    await RestCompletionAlertModule.present();
  } catch (error) {
    // Completion feedback is best-effort. Live Activities can be disabled and
    // the fallback must never interrupt a workout.
    if (__DEV__) console.warn('[AlgoSplit] Could not present the rest completion alert.', error);
  }
}
