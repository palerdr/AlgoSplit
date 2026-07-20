import ActivityKit
import ExpoModulesCore
import Voltra

public final class RestCompletionAlertModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestCompletionAlert")

    AsyncFunction("schedule") { (endsAtMs: Double, completionJson: String) async throws -> Bool in
      guard #available(iOS 26.0, *) else { return false }

      let deadline = Date(timeIntervalSince1970: endsAtMs / 1000)
      guard deadline.timeIntervalSinceNow > 0.5 else { return false }
      // Give an active foreground timer one tick to cancel this fallback and
      // present the same alert on its existing activity instead.
      let startDate = deadline.addingTimeInterval(
        RestCompletionConstants.foregroundGraceSeconds
      )

      _ = await cancelScheduledCompletion()

      let attributesData = try JSONSerialization.data(withJSONObject: [
        "name": RestCompletionConstants.activityName,
        "deepLinkUrl": RestCompletionConstants.deepLink,
      ])
      let attributes = try JSONDecoder().decode(VoltraAttributes.self, from: attributesData)
      let compressedJson = try BrotliCompression.compress(jsonString: completionJson)
      let state = try VoltraAttributes.ContentState(uiJsonData: compressedJson)
      let content = ActivityContent(
        state: state,
        staleDate: nil,
        relevanceScore: 1
      )
      let alert = restCompletionAlertConfiguration()
      let activity = try Activity<VoltraAttributes>.request(
        attributes: attributes,
        content: content,
        pushType: nil,
        // A transient activity is removed as soon as its expanded presentation
        // collapses. Completion must remain available until the user returns.
        style: .standard,
        alertConfiguration: alert,
        start: startDate
      )

      UserDefaults.standard.set(
        activity.id,
        forKey: RestCompletionConstants.scheduledActivityIDKey
      )
      return true
    }

    AsyncFunction("cancelScheduled") { () async -> Bool in
      guard #available(iOS 26.0, *) else { return true }
      return await cancelScheduledCompletion()
    }

    // Voltra doesn't currently expose ActivityKit's alertConfiguration option.
    // Updating the already-completed activity with an alert asks iOS to briefly
    // expand the Dynamic Island (or show its Lock Screen presentation).
    AsyncFunction("present") { () async in
      guard #available(iOS 16.4, *) else { return }

      guard let activity = Activity<VoltraAttributes>.activities.last(where: {
        encodedActivityName($0.attributes) == RestCompletionConstants.runningActivityName
      }) else { return }

      await activity.update(
        activity.content,
        alertConfiguration: restCompletionAlertConfiguration()
      )
    }
  }
}

private enum RestCompletionConstants {
  static let runningActivityName = "algosplit-rest-timer"
  static let activityName = "algosplit-rest-completion"
  static let deepLink = "algosplit://"
  static let foregroundGraceSeconds: TimeInterval = 0.75
  static let scheduledActivityIDKey = "algosplit.rest.scheduled-completion-id"
}

@available(iOS 16.4, *)
private func restCompletionAlertConfiguration() -> AlertConfiguration {
  AlertConfiguration(
    title: "Time for your set",
    body: "Open AlgoSplit to continue your workout.",
    sound: .default
  )
}

private func encodedActivityName(_ attributes: VoltraAttributes) -> String? {
  guard let data = try? JSONEncoder().encode(attributes),
        let json = try? JSONSerialization.jsonObject(with: data),
        let object = json as? [String: Any]
  else { return nil }
  return object["name"] as? String
}

@available(iOS 26.0, *)
private func cancelScheduledCompletion() async -> Bool {
  let defaults = UserDefaults.standard
  let storedActivityID = defaults.string(
    forKey: RestCompletionConstants.scheduledActivityIDKey
  )
  let activities = Activity<VoltraAttributes>.activities
  let activity = activities.first(where: { $0.id == storedActivityID })
    ?? activities.first(where: {
      encodedActivityName($0.attributes) == RestCompletionConstants.activityName
    })

  defaults.removeObject(forKey: RestCompletionConstants.scheduledActivityIDKey)

  guard let activity else {
    // A persisted ID that is no longer in ActivityKit means the scheduled
    // completion already ended or the user dismissed it.
    return storedActivityID == nil
  }

  let shouldPresentForegroundAlert = activity.activityState == .pending
  await activity.end(nil, dismissalPolicy: .immediate)
  return shouldPresentForegroundAlert
}
