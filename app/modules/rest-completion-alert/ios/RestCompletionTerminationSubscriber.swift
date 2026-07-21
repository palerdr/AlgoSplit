import Dispatch
import ExpoModulesCore
import UIKit

public final class RestCompletionTerminationSubscriber: ExpoAppDelegateSubscriber {
  public func applicationWillTerminate(_ application: UIApplication) {
    guard #available(iOS 16.4, *) else { return }

    let cleanupFinished = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
      defer { cleanupFinished.signal() }
      await endAllRestLiveActivitiesImmediately()
    }

    // UIApplication gives final cleanup only a few seconds. Waiting here keeps
    // the process alive long enough for ActivityKit's async end request while
    // still returning before iOS's termination deadline.
    _ = cleanupFinished.wait(timeout: .now() + 4)
  }
}
