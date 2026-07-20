import SwiftUI
import WidgetKit
import VoltraWidget

#if canImport(AlarmKit)
import ActivityKit
import AlarmKit

@available(iOSApplicationExtension 26.0, *)
struct RestAlarmMetadata: AlarmMetadata {
  let nextWorkout: String
}

@available(iOSApplicationExtension 26.0, *)
private struct RestAlarmLiveActivity: Widget {
  private let accent = Color(red: 65 / 255, green: 196 / 255, blue: 110 / 255)
  private let background = Color(red: 13 / 255, green: 13 / 255, blue: 13 / 255)
  private let primaryText = Color(red: 241 / 255, green: 236 / 255, blue: 228 / 255)
  private let secondaryText = Color(red: 138 / 255, green: 133 / 255, blue: 124 / 255)
  private let appURL = URL(string: "algosplit://")

  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<RestAlarmMetadata>.self) { context in
      lockScreen(context)
        .widgetURL(appURL)
        .activityBackgroundTint(background)
        .activitySystemActionForegroundColor(primaryText)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          HStack(spacing: 10) {
            Image(systemName: modeIcon(context.state))
              .foregroundStyle(accent)
            Text(modeTitle(context.state))
              .foregroundStyle(primaryText)
              .font(.headline)
            Spacer(minLength: 8)
            countdown(context.state)
              .foregroundStyle(primaryText)
              .font(.system(size: 24, weight: .semibold, design: .rounded))
          }
          .padding(.horizontal, 14)
          .padding(.vertical, 6)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 6) {
            Text("Next:")
              .foregroundStyle(secondaryText)
            Text(context.attributes.metadata?.nextWorkout ?? "Workout complete")
              .foregroundStyle(primaryText)
              .lineLimit(1)
            Spacer(minLength: 6)
            Image(systemName: "arrow.up.right.square")
              .foregroundStyle(accent)
          }
          .font(.subheadline.weight(.medium))
          .padding(.horizontal, 14)
          .padding(.bottom, 4)
        }
      } compactLeading: {
        EmptyView()
      } compactTrailing: {
        countdown(context.state)
          .foregroundStyle(primaryText)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .frame(maxWidth: 48)
      } minimal: {
        countdown(context.state)
          .foregroundStyle(primaryText)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .minimumScaleFactor(0.7)
      }
      .contentMargins(.all, 4, for: .compactTrailing)
      .contentMargins(.all, 4, for: .minimal)
      .keylineTint(accent)
      .widgetURL(appURL)
    }
  }

  private func lockScreen(
    _ context: ActivityViewContext<AlarmAttributes<RestAlarmMetadata>>
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        Image(systemName: modeIcon(context.state))
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(accent)
        Text(modeTitle(context.state))
          .foregroundStyle(secondaryText)
          .font(.subheadline.weight(.semibold))
        Spacer(minLength: 12)
        countdown(context.state)
          .foregroundStyle(primaryText)
          .font(.system(size: 30, weight: .semibold, design: .rounded))
      }

      HStack(spacing: 6) {
        Text("Next:")
          .foregroundStyle(secondaryText)
        Text(context.attributes.metadata?.nextWorkout ?? "Workout complete")
          .foregroundStyle(primaryText)
          .lineLimit(1)
      }
      .font(.subheadline.weight(.medium))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }

  @ViewBuilder
  private func countdown(_ state: AlarmPresentationState) -> some View {
    switch state.mode {
    case .countdown(let countdown):
      let displayStart = min(Date.now, countdown.fireDate)
      Text(timerInterval: displayStart ... countdown.fireDate, countsDown: true, showsHours: false)
        .monospacedDigit()
        .lineLimit(1)
    case .paused(let paused):
      let remaining = Duration.seconds(
        max(0, paused.totalCountdownDuration - paused.previouslyElapsedDuration)
      )
      Text(remaining.formatted(.time(pattern: .minuteSecond)))
        .monospacedDigit()
        .lineLimit(1)
    default:
      Text("Done")
        .lineLimit(1)
    }
  }

  private func modeTitle(_ state: AlarmPresentationState) -> String {
    switch state.mode {
    case .countdown: "Rest"
    case .paused: "Rest paused"
    default: "Rest complete"
    }
  }

  private func modeIcon(_ state: AlarmPresentationState) -> String {
    switch state.mode {
    case .countdown: "timer"
    case .paused: "pause.fill"
    default: "checkmark.circle.fill"
    }
  }
}
#endif

@main
struct VoltraWidgetBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    VoltraWidget()

    #if canImport(AlarmKit)
    if #available(iOSApplicationExtension 26.0, *) {
      RestAlarmLiveActivity()
    }
    #endif
  }
}
