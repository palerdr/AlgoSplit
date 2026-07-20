import RestCompletionAlertModule from '../../modules/rest-completion-alert';

export async function presentRestCompletionAlert(): Promise<void> {
  try {
    await RestCompletionAlertModule.present();
  } catch (error) {
    // Completion feedback is best-effort. Live Activities can be disabled and
    // the fallback must never interrupt a workout.
    if (__DEV__) console.warn('[AlgoSplit] Could not present the rest completion alert.', error);
  }
}
