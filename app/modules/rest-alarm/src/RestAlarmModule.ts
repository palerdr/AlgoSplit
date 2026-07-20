import { NativeModule, requireNativeModule } from 'expo';
import type { RestAlarmSchedule } from './RestAlarm.types';

declare class RestAlarmModule extends NativeModule {
  schedule(schedule: RestAlarmSchedule): Promise<boolean>;
  cancel(): Promise<void>;
  presentCompletionAlert(): Promise<void>;
}

export default requireNativeModule<RestAlarmModule>('RestAlarm');
