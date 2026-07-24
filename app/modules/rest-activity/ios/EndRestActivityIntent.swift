import ActivityKit
import AppIntents
import Foundation

// Dismisses the rest Live Activity from its own ✕ button, without opening
// the app. LiveActivityIntent runs in the app's process in the background.
//
// This struct is duplicated VERBATIM in the widget extension
// (modules/rest-activity/widget/VoltraWidgetBundle.swift) — Apple requires
// LiveActivityIntent code to be included in both the app and the widget
// extension targets. The two copies must stay byte-for-byte identical.
@available(iOS 17.2, *)
struct EndRestActivityIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Dismiss Rest Timer"
  static let isDiscoverable = false

  func perform() async throws -> some IntentResult {
    UserDefaults.standard.removeObject(forKey: "algosplit.rest.scheduled-alert-id")
    for activity in Activity<RestActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    return .result()
  }
}
