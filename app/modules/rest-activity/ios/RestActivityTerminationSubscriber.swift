import Dispatch
import ExpoModulesCore
import UIKit

public final class RestActivityTerminationSubscriber: ExpoAppDelegateSubscriber {
  // Retries a rest-activity start that raced the app into the background,
  // and clears finished completion reminders now that the user is back.
  public func applicationDidBecomeActive(_ application: UIApplication) {
    Task.detached(priority: .userInitiated) {
      await handleRestActivityForegroundActivation()
    }
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    let cleanupFinished = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
      defer { cleanupFinished.signal() }
      await endAllRestActivitiesImmediately()
    }

    // UIApplication gives final cleanup only a few seconds. Waiting here keeps
    // the process alive long enough for ActivityKit's async end request while
    // still returning before iOS's termination deadline.
    _ = cleanupFinished.wait(timeout: .now() + 4)
  }
}
