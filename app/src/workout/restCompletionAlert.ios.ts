import RestAlarmModule from '../../modules/rest-alarm';

export async function presentRestCompletionAlert(): Promise<void> {
  try {
    await RestAlarmModule.presentCompletionAlert();
  } catch (error) {
    // Completion feedback is best-effort. Live Activities can be disabled and
    // the fallback must never interrupt a workout.
    if (__DEV__) console.warn('[AlgoSplit] Could not present the rest completion alert.', error);
  }
}
