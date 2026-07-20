import RestAlarmModule, { type RestAlarmSchedule } from '../../modules/rest-alarm';

export async function scheduleRestAlarm(schedule: RestAlarmSchedule): Promise<boolean> {
  try {
    return await RestAlarmModule.schedule(schedule);
  } catch (error) {
    // AlarmKit is optional (iOS 26+) and requires per-app authorization.
    // Returning false lets the caller use its ActivityKit fallback.
    if (__DEV__) console.warn('[AlgoSplit] System rest alarm unavailable.', error);
    return false;
  }
}

export async function cancelRestAlarm(): Promise<void> {
  try {
    await RestAlarmModule.cancel();
  } catch (error) {
    if (__DEV__) console.warn('[AlgoSplit] Could not cancel the system rest alarm.', error);
  }
}
