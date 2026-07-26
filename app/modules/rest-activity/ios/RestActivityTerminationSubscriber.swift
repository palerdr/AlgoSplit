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

  // Releases a rest that is already over before the process is suspended.
  // After this the app gets no runtime until the user comes back, so anything
  // left in the Dynamic Island stays there for as long as they stay away.
  public func applicationDidEnterBackground(_ application: UIApplication) {
    let sweepFinished = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
      defer { sweepFinished.signal() }
      await handleRestActivityBackgroundTransition()
    }

    // The sweep ends nothing in the common case (a rest still running, or none
    // at all) and returns in microseconds. The bounded wait is only here so an
    // actual end request lands before suspension freezes it mid-flight; it
    // stays well inside the runtime iOS grants on this transition. Nothing on
    // this path touches the main actor, so the wait cannot deadlock.
    _ = sweepFinished.wait(timeout: .now() + 2)
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
