import ActivityKit
import ExpoModulesCore
import Voltra

public final class RestCompletionAlertModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestCompletionAlert")

    // Voltra doesn't currently expose ActivityKit's alertConfiguration option.
    // Updating the already-completed activity with an alert asks iOS to briefly
    // expand the Dynamic Island (or show its Lock Screen presentation).
    AsyncFunction("present") { () async in
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
