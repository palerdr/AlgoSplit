import Dispatch
import ExpoModulesCore
import UIKit

public final class RestActivityTerminationSubscriber: ExpoAppDelegateSubscriber {
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
