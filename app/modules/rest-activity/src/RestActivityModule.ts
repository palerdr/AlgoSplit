import { NativeModule, requireNativeModule } from 'expo';

declare class RestActivityModule extends NativeModule {
  /** Starts the rest Live Activity, replacing any previous one. */
  start(startedAtMs: number, endsAtMs: number, nextUp: string | null): Promise<boolean>;
  /** Flips the activity to its completion state and alerts. */
  complete(): Promise<void>;
  /** Ends every rest activity immediately. */
  end(): Promise<void>;
}

export default requireNativeModule<RestActivityModule>('RestActivity');
