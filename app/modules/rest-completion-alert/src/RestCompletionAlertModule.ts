import { NativeModule, requireNativeModule } from 'expo';

declare class RestCompletionAlertModule extends NativeModule {
  present(): Promise<void>;
}

export default requireNativeModule<RestCompletionAlertModule>('RestCompletionAlert');
