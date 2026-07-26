import ActivityKit
import ExpoModulesCore

// Owns the full lifecycle of the rest-timer Live Activity: one persistent
// activity per rest, created with typed state (no serialized UI payloads).
//
// A rest that is over releases the system surface. The Dynamic Island is a
// single shared slot — a finished reminder left sitting in it strands whatever
// the user is actually doing (navigation, CarPlay, a call) out of the island —
// so completion ENDS the activity rather than parking it in a terminal state.
// Once ended, iOS drops it from the island immediately and closes its update
// channel; only a tappable Lock Screen card survives, for a bounded window the
// system tears down on its own even if the app is never opened again.
//
// Deadline behavior without the app running:
// - staleDate is set to the rest deadline. When it passes, the system
//   re-renders the widget with isStale == true and the widget flips to its
//   completion UI. No push, no background task.
// - On iOS 26+, a second, transient activity is scheduled at the deadline
//   purely to fire an AlertConfiguration (haptic + Lock Screen alert). It
//   removes itself after alerting.
// - The persistent activity is swept on every lifecycle edge the app is given
//   — foreground, background, termination — so a rest that ended while the app
//   was suspended never outlives the app's next breath of runtime.
public final class RestActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestActivity")

    AsyncFunction("start") { (startedAtMs: Double, endsAtMs: Double, nextUp: String?) async -> Bool in
      await performRestActivityStart(
        RestStartTiming(startedAtMs: startedAtMs, endsAtMs: endsAtMs, nextUp: nextUp)
      )
    }

    AsyncFunction("complete") { () async in
      await endRestActivitiesAsCompleted()
    }

    AsyncFunction("end") { () async in
      await endAllRestActivitiesImmediately()
    }
  }
}

enum RestActivityConstants {
  static let scheduledAlertIDKey = "algosplit.rest.scheduled-alert-id"
  // Give an active foreground timer one tick to retire the scheduled alert
  // before it fires: a rest the user watched end needs no buzz.
  static let foregroundGraceSeconds: TimeInterval = 0.75
  // How long the finished reminder may linger on the Lock Screen after its
  // activity has ended. The Dynamic Island releases an ended activity
  // immediately; this only bounds the tappable "Time for your set" card, and
  // the system removes it without the app running.
  static let completionResidueSeconds: TimeInterval = 45
  // Relevance only breaks ties for the single Dynamic Island slot. A running
  // rest earns its place there; anything finished must never outrank another
  // app's live activity, which is exactly how a straggling reminder ends up
  // holding the island hostage.
  static let runningRelevance: Double = 50
  static let finishedRelevance: Double = 0
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
    relevanceScore: RestActivityConstants.runningRelevance
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
  await endFinishedRestActivities(keepingResidue: false)
}

// Runs as the app leaves the foreground. A rest that finished while the app
// was in front is released here rather than being frozen into the Dynamic
// Island for as long as the user stays out of the app — which, for someone who
// closes AlgoSplit and starts driving, is the whole trip.
//
// Deliberately does NOT touch a parked start: that start exists precisely
// because it raced this transition, and the next activation retries it.
func handleRestActivityBackgroundTransition() async {
  await endFinishedRestActivities(keepingResidue: true)
}

// Ends every activity that has nothing left to say — an app-driven completion,
// or a deadline the system already passed while the app was suspended — and
// leaves a still-running rest alone.
//
// `keepingResidue` spares an activity that is already ended and merely waiting
// out its system-owned Lock Screen dismissal. On the way out of the app that
// card is still the user's way back into the workout; on the way in they are
// already back, so the reminder has served its purpose and goes.
func endFinishedRestActivities(keepingResidue: Bool) async {
  let scheduledAlertID = UserDefaults.standard.string(
    forKey: RestActivityConstants.scheduledAlertIDKey
  )

  for activity in Activity<RestActivityAttributes>.activities {
    let retired =
      activity.activityState == .ended || activity.activityState == .dismissed
    if keepingResidue && retired { continue }

    let state = activity.content.state
    let deadlinePassed =
      Date(timeIntervalSince1970: state.endsAtMs / 1_000).timeIntervalSinceNow <= 0
    // The scheduled buzz alert carries isComplete before it fires; ending it
    // here would silently drop the completion alert for a still-running rest.
    if activity.id == scheduledAlertID && !deadlinePassed { continue }
    // isComplete covers app-driven completion; a passed deadline covers the
    // staleDate flip that happens while the app is suspended.
    if state.isComplete || deadlinePassed {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

// Retires every rest activity into its completion state.
//
// Ending — rather than updating and leaving the activity alive — is what
// releases the Dynamic Island: iOS drops an ended activity from the island at
// once and stops treating the app as an owner of that surface. The dismissal
// policy then hands the leftover Lock Screen card to the system on a fixed
// deadline, so nothing here depends on the app ever being opened again.
func endRestActivitiesAsCompleted() async {
  let defaults = UserDefaults.standard
  // Taken before the loop: the scheduled buzz is redundant once the rest has
  // finished with the app watching, and must not leave a second card behind.
  let scheduledAlertID = defaults.string(
    forKey: RestActivityConstants.scheduledAlertIDKey
  )
  defaults.removeObject(forKey: RestActivityConstants.scheduledAlertIDKey)

  let dismissAt = Date().addingTimeInterval(
    RestActivityConstants.completionResidueSeconds
  )
  for activity in Activity<RestActivityAttributes>.activities
  where activity.activityState != .ended && activity.activityState != .dismissed {
    guard activity.id != scheduledAlertID else {
      await activity.end(nil, dismissalPolicy: .immediate)
      continue
    }

    let previous = activity.content.state
    let completed = RestActivityAttributes.ContentState(
      startedAtMs: previous.startedAtMs,
      endsAtMs: previous.endsAtMs,
      nextUp: previous.nextUp,
      isComplete: true
    )
    await activity.end(
      ActivityContent(
        state: completed,
        staleDate: nil,
        relevanceScore: RestActivityConstants.finishedRelevance
      ),
      dismissalPolicy: .after(dismissAt)
    )
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
  // The AlertConfiguration is what makes this loud; relevance would only buy
  // it the island slot at another app's expense, which is not worth a buzz.
  let content = ActivityContent(
    state: completedState,
    staleDate: nil,
    relevanceScore: RestActivityConstants.finishedRelevance
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
