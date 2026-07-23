import ActivityKit
import SwiftUI
import WidgetKit

// AlgoSplit rest-timer Live Activity.
//
// Two states, both rendered natively from typed ActivityKit content:
// - Running: self-updating countdown (Text(timerInterval:)) plus the next
//   exercise, on the Lock Screen and across the Dynamic Island.
// - Complete: "Time for your set" with a link back into the app. Entered
//   either by an app-driven update (isComplete) or, with the app suspended,
//   by the system marking the activity stale at its deadline (staleDate is
//   set to the rest deadline; context.isStale flips with no push needed).
//
// Every timer Text sits in a fixed-width frame: date-relative text is greedy
// and will otherwise stretch the compact island across the whole cutout.

// Shared ActivityKit contract — duplicated VERBATIM from
// modules/rest-activity/ios/RestActivityAttributes.swift. ActivityKit matches
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

private extension RestActivityAttributes.ContentState {
  var interval: ClosedRange<Date> {
    let start = Date(timeIntervalSince1970: startedAtMs / 1_000)
    let end = Date(timeIntervalSince1970: max(endsAtMs, startedAtMs + 1_000) / 1_000)
    return start ... end
  }

  var nextUpLabel: String {
    let trimmed = nextUp?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? "Continue workout" : trimmed
  }
}

private enum RestStyle {
  static let accent = Color(red: 65 / 255, green: 196 / 255, blue: 110 / 255)
  static let background = Color(red: 13 / 255, green: 13 / 255, blue: 13 / 255)
  static let text = Color(red: 241 / 255, green: 236 / 255, blue: 228 / 255)
  static let secondary = Color(red: 138 / 255, green: 133 / 255, blue: 124 / 255)
  static let deepLink = URL(string: "algosplit://")!
}

/// Self-updating countdown, pinned to a fixed width so it never stretches
/// its container.
private struct RestCountdown: View {
  let interval: ClosedRange<Date>
  var fontSize: CGFloat
  var width: CGFloat
  var color: Color = RestStyle.text
  var alignment: Alignment = .trailing

  var body: some View {
    Text(timerInterval: interval, countsDown: true, showsHours: false)
      .font(.system(size: fontSize, weight: .semibold, design: .rounded))
      .monospacedDigit()
      .multilineTextAlignment(alignment == .leading ? .leading : .trailing)
      .foregroundStyle(color)
      .lineLimit(1)
      .frame(width: width, alignment: alignment)
  }
}

private struct RestBadge: View {
  var fontSize: CGFloat = 12

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: "timer")
        .font(.system(size: fontSize, weight: .semibold))
        .foregroundStyle(RestStyle.accent)
      Text("REST")
        .font(.system(size: fontSize, weight: .semibold))
        .foregroundStyle(RestStyle.secondary)
    }
  }
}

// MARK: - Lock Screen

private struct RestLockScreenRunningView: View {
  let state: RestActivityAttributes.ContentState

  var body: some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        RestBadge()
        RestCountdown(
          interval: state.interval,
          fontSize: 32,
          width: 96,
          alignment: .leading
        )
      }
      Spacer(minLength: 8)
      VStack(alignment: .trailing, spacing: 4) {
        Text("NEXT SET")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(RestStyle.secondary)
        Text(state.nextUpLabel)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(RestStyle.text)
          .lineLimit(1)
          .truncationMode(.tail)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
  }
}

private struct RestLockScreenCompleteView: View {
  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(RestStyle.accent)
      VStack(alignment: .leading, spacing: 2) {
        Text("Time for your set")
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(RestStyle.text)
        Text("Back to workout")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(RestStyle.secondary)
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(RestStyle.secondary)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
  }
}

// MARK: - Widget

struct AlgoSplitRestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { context in
      Group {
        if isComplete(context) {
          RestLockScreenCompleteView()
        } else {
          RestLockScreenRunningView(state: context.state)
        }
      }
      .widgetURL(RestStyle.deepLink)
      .activityBackgroundTint(RestStyle.background)
    } dynamicIsland: { context in
      isComplete(context) ? completeIsland() : runningIsland(context.state)
    }
  }

  private func isComplete(
    _ context: ActivityViewContext<RestActivityAttributes>
  ) -> Bool {
    context.state.isComplete || context.isStale
  }

  private func runningIsland(
    _ state: RestActivityAttributes.ContentState
  ) -> DynamicIsland {
    DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        RestBadge(fontSize: 14)
          .padding(.leading, 6)
      }
      DynamicIslandExpandedRegion(.trailing) {
        RestCountdown(
          interval: state.interval,
          fontSize: 20,
          width: 60,
          color: RestStyle.accent
        )
        .padding(.trailing, 6)
      }
      DynamicIslandExpandedRegion(.bottom) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 6) {
            Text("NEXT")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(RestStyle.secondary)
            Text(state.nextUpLabel)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(RestStyle.text)
              .lineLimit(1)
              .truncationMode(.tail)
          }
          ProgressView(timerInterval: state.interval, countsDown: true)
            .tint(RestStyle.accent)
            .labelsHidden()
        }
        .padding(.horizontal, 6)
        .padding(.top, 6)
        .widgetURL(RestStyle.deepLink)
      }
    } compactLeading: {
      Image(systemName: "timer")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(RestStyle.accent)
    } compactTrailing: {
      RestCountdown(
        interval: state.interval,
        fontSize: 14,
        width: 44,
        color: RestStyle.text
      )
    } minimal: {
      Image(systemName: "timer")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(RestStyle.accent)
    }
    .keylineTint(RestStyle.accent)
  }

  private func completeIsland() -> DynamicIsland {
    DynamicIsland {
      DynamicIslandExpandedRegion(.center) {
        HStack(spacing: 9) {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(RestStyle.accent)
          Text("Time for your set")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(RestStyle.text)
        }
        .padding(.vertical, 4)
      }
      DynamicIslandExpandedRegion(.bottom) {
        Link(destination: RestStyle.deepLink) {
          HStack(spacing: 7) {
            Text("Back to workout")
              .font(.system(size: 15, weight: .bold))
            Image(systemName: "arrow.right")
              .font(.system(size: 13, weight: .semibold))
          }
          .foregroundStyle(RestStyle.accent)
          .padding(.vertical, 6)
        }
      }
    } compactLeading: {
      EmptyView()
    } compactTrailing: {
      Image(systemName: "checkmark")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(RestStyle.accent)
    } minimal: {
      Image(systemName: "checkmark")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(RestStyle.accent)
    }
    .keylineTint(RestStyle.accent)
  }
}

@main
struct VoltraWidgetBundle: WidgetBundle {
  var body: some Widget {
    AlgoSplitRestActivityWidget()
  }
}
