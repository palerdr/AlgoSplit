import ActivityKit
import ExpoModulesCore
import Voltra

#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import SwiftUI
#endif

public final class RestAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestAlarm")

    AsyncFunction("schedule") { (schedule: RestAlarmSchedule) async throws -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return try await scheduleSystemRestAlarm(schedule)
      }
      #endif

      return false
    }

    AsyncFunction("cancel") {
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        try? AlarmManager.shared.cancel(id: RestAlarmConstants.id)
      }
      #endif
    }

    // Voltra doesn't currently expose ActivityKit's alertConfiguration option.
    // Re-alerting the activity with its already-updated content gives older iOS
    // versions the documented expanded Dynamic Island completion presentation.
    AsyncFunction("presentCompletionAlert") { () async in
      guard #available(iOS 16.4, *),
            let activity = Activity<VoltraAttributes>.activities.last
      else { return }

      let alert = AlertConfiguration(
        title: "Rest complete",
        body: "Open AlgoSplit to continue your workout.",
        sound: .default
      )
      await activity.update(activity.content, alertConfiguration: alert)
    }
  }
}

private struct RestAlarmSchedule: Record {
  @Field var endsAtMs: Double
  @Field var nextWorkout: String?
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private enum RestAlarmConstants {
  // AlgoSplit supports one active rest period at a time. A stable identifier
  // makes a new rest replace any orphaned countdown from an earlier process.
  static let id = UUID(uuidString: "A1905E57-0F4A-4C49-A903-EE79E55280D1")!
}

// Keep this internal (not file-private) and structurally identical to the
// widget extension's metadata type so AlarmKit can decode it across processes.
@available(iOS 26.0, *)
struct RestAlarmMetadata: AlarmMetadata {
  let nextWorkout: String
}

@available(iOS 26.0, *)
private func scheduleSystemRestAlarm(_ schedule: RestAlarmSchedule) async throws -> Bool {
  let manager = AlarmManager.shared
  let authorization: AlarmManager.AuthorizationState

  switch manager.authorizationState {
  case .notDetermined:
    authorization = try await manager.requestAuthorization()
  case .authorized:
    authorization = .authorized
  case .denied:
    return false
  @unknown default:
    return false
  }

  guard authorization == .authorized else { return false }

  let remainingSeconds = (schedule.endsAtMs / 1000) - Date.now.timeIntervalSince1970
  guard remainingSeconds > 0.5 else { return false }

  try? manager.cancel(id: RestAlarmConstants.id)

  let openButton = AlarmButton(
    text: "Open",
    textColor: .white,
    systemImageName: "arrow.up.right.square.fill"
  )
  // Keep the iOS 26.0-compatible overload. The system-provided stop-control
  // initializer is only available starting in iOS 26.1.
  let stopButton = AlarmButton(
    text: "Stop",
    textColor: .white,
    systemImageName: "stop.fill"
  )
  let alert = AlarmPresentation.Alert(
    title: "Rest complete",
    stopButton: stopButton,
    secondaryButton: openButton,
    secondaryButtonBehavior: .custom
  )
  let countdown = AlarmPresentation.Countdown(title: "Rest")
  let presentation = AlarmPresentation(alert: alert, countdown: countdown)
  let metadata = RestAlarmMetadata(
    nextWorkout: schedule.nextWorkout?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
      ?? "Workout complete"
  )
  let attributes = AlarmAttributes(
    presentation: presentation,
    metadata: metadata,
    tintColor: Color(red: 65 / 255, green: 196 / 255, blue: 110 / 255)
  )
  let configuration: AlarmManager.AlarmConfiguration<RestAlarmMetadata> = .timer(
    duration: remainingSeconds,
    attributes: attributes,
    secondaryIntent: OpenRestAlarmIntent(alarmID: RestAlarmConstants.id.uuidString),
    sound: .default
  )

  _ = try await manager.schedule(id: RestAlarmConstants.id, configuration: configuration)
  return true
}

@available(iOS 26.0, *)
private extension String {
  var nonEmpty: String? { isEmpty ? nil : self }
}

@available(iOS 26.0, *)
public struct OpenRestAlarmIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Open AlgoSplit"
  public static var description = IntentDescription("Stops the rest alert and opens AlgoSplit.")
  public static let supportedModes: IntentModes = [.foreground(.immediate)]

  @Parameter(title: "Alarm ID")
  public var alarmID: String

  public init(alarmID: String) {
    self.alarmID = alarmID
  }

  public init() {
    alarmID = ""
  }

  public func perform() async throws -> some IntentResult {
    guard let id = UUID(uuidString: alarmID) else { return .result() }
    try? AlarmManager.shared.stop(id: id)
    return .result()
  }
}

public struct RestAlarmIntentsPackage: AppIntentsPackage {}
#endif
