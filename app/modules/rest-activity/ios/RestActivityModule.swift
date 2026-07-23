import ActivityKit
import ExpoModulesCore

// Owns the full lifecycle of the rest-timer Live Activity: one persistent
// activity per rest, created with typed state (no serialized UI payloads).
//
// Deadline behavior without the app running:
// - staleDate is set to the rest deadline. When it passes, the system
//   re-renders the widget with isStale == true and the widget flips to its
//   completion UI. No push, no background task.
// - On iOS 26+, a second, transient activity is scheduled at the deadline
//   purely to fire an AlertConfiguration (haptic + expanded island alert).
//   It removes itself after alerting; the persistent activity remains as the
//   completion state until the user returns or the next rest starts.
public final class RestActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestActivity")

    AsyncFunction("start") { (startedAtMs: Double, endsAtMs: Double, nextUp: String?) async -> Bool in
      await performRestActivityStart(
        RestStartTiming(startedAtMs: startedAtMs, endsAtMs: endsAtMs, nextUp: nextUp)
      )
    }

    AsyncFunction("complete") { () async in
      await cancelScheduledAlert()

      // Flip the persistent activity to its completion state. The alert asks
      // iOS to expand the Dynamic Island (or present on the Lock Screen) so
      // an in-app completion is just as loud as the scheduled one.
      for activity in Activity<RestActivityAttributes>.activities {
        let previous = activity.content.state
        let completed = RestActivityAttributes.ContentState(
          startedAtMs: previous.startedAtMs,
          endsAtMs: previous.endsAtMs,
          nextUp: previous.nextUp,
          isComplete: true
        )
        await activity.update(
          ActivityContent(state: completed, staleDate: nil, relevanceScore: 100),
          alertConfiguration: restAlertConfiguration()
        )
      }
    }

    AsyncFunction("end") { () async in
      await endAllRestActivitiesImmediately()
    }
  }
}

enum RestActivityConstants {
  static let scheduledAlertIDKey = "algosplit.rest.scheduled-alert-id"
  // Give an active foreground timer one tick to cancel the scheduled alert
  // and present the same alert on the persistent activity instead.
  static let foregroundGraceSeconds: TimeInterval = 0.75
}

struct RestStartTiming {
  let startedAtMs: Double
  let endsAtMs: Double
  let nextUp: String?
}

// iOS only allows requesting a Live Activity while the app is foregrounded.
// A start that races the user backgrounding the app is parked here and
// retried on the next foreground activation.
@MainActor
enum RestActivityPendingStart {
  static var timing: RestStartTiming?
}

@discardableResult
func performRestActivityStart(_ timing: RestStartTiming) async -> Bool {
  await MainActor.run { RestActivityPendingStart.timing = nil }

  // A new rest replaces anything left over from the previous one.
  await endAllRestActivitiesImmediately()

  guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
  let endsAt = Date(timeIntervalSince1970: timing.endsAtMs / 1_000)
  guard endsAt.timeIntervalSinceNow > 1 else { return false }

  let state = RestActivityAttributes.ContentState(
    startedAtMs: timing.startedAtMs,
    endsAtMs: timing.endsAtMs,
    nextUp: timing.nextUp,
    isComplete: false
  )
  let content = ActivityContent(
    state: state,
    staleDate: endsAt,
    relevanceScore: 50
  )

  do {
    _ = try Activity<RestActivityAttributes>.request(
      attributes: RestActivityAttributes(),
      content: content,
      pushType: nil
    )
  } catch {
    // Requests are rejected once the app leaves the foreground (e.g. the
    // user swiped home right after starting the rest). Park the start so
    // the next foreground activation can retry while the rest is live.
    await MainActor.run { RestActivityPendingStart.timing = timing }
    return false
  }

  if #available(iOS 26.0, *) {
    scheduleCompletionAlert(endsAt: endsAt, runningState: state)
  }
  return true
}

// Runs on every foreground activation: retries a parked start while its
// deadline is still ahead, then clears finished activities — the user is
// back in the app, so the completion reminder has served its purpose.
func handleRestActivityForegroundActivation() async {
  let pending = await MainActor.run { RestActivityPendingStart.timing }
  if let pending,
     Date(timeIntervalSince1970: pending.endsAtMs / 1_000).timeIntervalSinceNow > 1 {
    await performRestActivityStart(pending)
    return
  }
  await MainActor.run { RestActivityPendingStart.timing = nil }

  for activity in Activity<RestActivityAttributes>.activities {
    let state = activity.content.state
    let deadline = Date(timeIntervalSince1970: state.endsAtMs / 1_000)
    // isComplete covers app-driven completion; a passed deadline covers the
    // staleDate flip that happens while the app is suspended.
    if state.isComplete || deadline.timeIntervalSinceNow <= 0 {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

private func restAlertConfiguration() -> AlertConfiguration {
  AlertConfiguration(
    title: "Time for your set",
    body: "Open AlgoSplit to continue your workout.",
    sound: .default
  )
}

// Schedules the transient alert-only activity. Failure is acceptable: the
// persistent activity still flips to its completion UI via staleDate.
@available(iOS 26.0, *)
private func scheduleCompletionAlert(
  endsAt: Date,
  runningState: RestActivityAttributes.ContentState
) {
  let completedState = RestActivityAttributes.ContentState(
    startedAtMs: runningState.startedAtMs,
    endsAtMs: runningState.endsAtMs,
    nextUp: runningState.nextUp,
    isComplete: true
  )
  let content = ActivityContent(
    state: completedState,
    staleDate: nil,
    relevanceScore: 100
  )

  do {
    let activity = try Activity<RestActivityAttributes>.request(
      attributes: RestActivityAttributes(),
      content: content,
      pushType: nil,
      style: .transient,
      alertConfiguration: restAlertConfiguration(),
      start: endsAt.addingTimeInterval(RestActivityConstants.foregroundGraceSeconds)
    )
    UserDefaults.standard.set(
      activity.id,
      forKey: RestActivityConstants.scheduledAlertIDKey
    )
  } catch {
    // Live Activities can be disabled or throttled; the rest timer must
    // never fail because its completion alert could not be scheduled.
  }
}

// Ends only the scheduled alert activity, leaving the persistent one alone.
private func cancelScheduledAlert() async {
  let defaults = UserDefaults.standard
  guard let storedID = defaults.string(
    forKey: RestActivityConstants.scheduledAlertIDKey
  ) else { return }
  defaults.removeObject(forKey: RestActivityConstants.scheduledAlertIDKey)

  for activity in Activity<RestActivityAttributes>.activities
  where activity.id == storedID {
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}

// Ends every rest activity, scheduled or live. Also used by the termination
// subscriber so no orphaned activity outlives the app.
func endAllRestActivitiesImmediately() async {
  UserDefaults.standard.removeObject(
    forKey: RestActivityConstants.scheduledAlertIDKey
  )
  for activity in Activity<RestActivityAttributes>.activities {
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}
