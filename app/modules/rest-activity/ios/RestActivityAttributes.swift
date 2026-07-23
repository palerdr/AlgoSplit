import ActivityKit
import Foundation

// The ActivityKit contract for the rest-timer Live Activity.
//
// This struct is duplicated VERBATIM in the widget extension
// (modules/rest-activity/widget/VoltraWidgetBundle.swift). ActivityKit matches
// activities across the app/extension boundary by attribute type name and
// Codable shape, so the two copies must stay byte-for-byte identical.
struct RestActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// Epoch milliseconds when the rest began.
    var startedAtMs: Double
    /// Epoch milliseconds when the rest ends.
    var endsAtMs: Double
    /// Display name of the next exercise, if known.
    var nextUp: String?
    /// True once the rest has finished and the user should return to the app.
    var isComplete: Bool
  }
}
