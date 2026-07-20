interface RestAlarmSchedule {
  endsAtMs: number;
  nextWorkout: string | null;
}

export function scheduleRestAlarm(_schedule: RestAlarmSchedule): Promise<boolean> {
  return Promise.resolve(false);
}

export function cancelRestAlarm(): Promise<void> {
  return Promise.resolve();
}
