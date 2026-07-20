import { NativeModule, requireNativeModule } from 'expo';

declare class RestCompletionAlertModule extends NativeModule {
  present(): Promise<void>;
  schedule(endsAtMs: number, completionJson: string): Promise<boolean>;
  cancelScheduled(): Promise<boolean>;
}

export default requireNativeModule<RestCompletionAlertModule>('RestCompletionAlert');
