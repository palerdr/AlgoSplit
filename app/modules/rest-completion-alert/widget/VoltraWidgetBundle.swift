import ActivityKit
import SwiftUI
import WidgetKit
import VoltraWidget

// AlgoSplit rest-timer Live Activity.
//
// Scope: show the rest countdown while a rest is active — on the Lock Screen
// and in the Dynamic Island (compact, minimal, expanded). The countdown is
// driven entirely by SwiftUI's Text(timerInterval:) / ProgressView(timerInterval:),
// which advance on their own with no widget refresh, push, or app wake-up.
//
// The activity is delivered through Voltra, so the only thing the widget
// receives is Voltra's payload. We read the rest window (start/end) out of the
// payload's Timer node and render the countdown natively. When the payload has
// no Timer — e.g. once the app swaps in a completion state — we fall back to
// rendering Voltra's payload for that region, so nothing regresses.

private enum RestStyle {
  static let accent = Color(red: 65 / 255, green: 196 / 255, blue: 110 / 255)
  static let background = Color(red: 13 / 255, green: 13 / 255, blue: 13 / 255)
  static let text = Color(red: 241 / 255, green: 236 / 255, blue: 228 / 255)
  static let secondary = Color(red: 138 / 255, green: 133 / 255, blue: 124 / 255)
  static let deepLink = URL(string: "algosplit://")!
}

// MARK: - Rest window extraction

/// The active rest interval, recovered from the payload's Timer node.
private struct RestWindow {
  let start: Date
  let end: Date

  init?(_ parameters: TimerParameters) {
    guard let startAtMs = parameters.startAtMs,
          let endAtMs = parameters.endAtMs,
          endAtMs > startAtMs
    else { return nil }
    start = Date(timeIntervalSince1970: startAtMs / 1_000)
    end = Date(timeIntervalSince1970: endAtMs / 1_000)
  }

  var range: ClosedRange<Date> { start ... end }
}

/// Depth-first search for the first Timer component in a node subtree.
private func firstTimer(in node: VoltraNode) -> TimerParameters? {
  switch node {
  case let .element(element):
    if element.type == "Timer" {
      return element.parameters(TimerParameters.self)
    }
    if let children = element.children {
      return firstTimer(in: children)
    }
    return nil
  case let .array(nodes):
    return nodes.lazy.compactMap(firstTimer(in:)).first
  case .text, .empty:
    return nil
  }
}

/// The rest window, if the payload still describes an active countdown.
private func restWindow(in state: VoltraAttributes.ContentState) -> RestWindow? {
  let regions = state.regions
  for region in VoltraRegion.allCases {
    guard let nodes = regions[region] else { continue }
    for node in nodes {
      if let parameters = firstTimer(in: node), let window = RestWindow(parameters) {
        return window
      }
    }
  }
  return nil
}

/// Collapse a region's nodes into a single root for Voltra fallback rendering.
private func voltraRoot(
  for region: VoltraRegion,
  in state: VoltraAttributes.ContentState
) -> VoltraNode {
  let nodes = state.regions[region] ?? []
  if nodes.isEmpty { return .empty }
  return nodes.count == 1 ? nodes[0] : .array(nodes)
}

// MARK: - Reusable views

/// Self-updating rest countdown. Text(timerInterval:) ticks without refreshes.
private struct RestCountdown: View {
  let range: ClosedRange<Date>
  var size: CGFloat
  var color: Color = RestStyle.text

  var body: some View {
    Text(timerInterval: range, countsDown: true, showsHours: false)
      .font(.system(size: size, weight: .semibold, design: .rounded))
      .monospacedDigit()
      .foregroundStyle(color)
      .lineLimit(1)
  }
}

private struct RestLabel: View {
  var size: CGFloat = 13

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "timer")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(RestStyle.accent)
      Text("REST")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(RestStyle.secondary)
    }
  }
}

// MARK: - Lock Screen

private struct RestLockScreenView: View {
  let window: RestWindow

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        RestLabel(size: 12)
        RestCountdown(range: window.range, size: 34)
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(RestStyle.secondary)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
  }
}

// MARK: - Widget

struct AlgoSplitRestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: VoltraAttributes.self) { context in
      lockScreen(context)
        .widgetURL(RestStyle.deepLink)
        .activityBackgroundTint(RestStyle.background)
    } dynamicIsland: { context in
      dynamicIsland(context)
    }
  }

  // Lock Screen / banner presentation.
  @ViewBuilder
  private func lockScreen(_ context: ActivityViewContext<VoltraAttributes>) -> some View {
    if let window = restWindow(in: context.state) {
      RestLockScreenView(window: window)
    } else {
      Voltra(root: voltraRoot(for: .lockScreen, in: context.state), activityId: context.activityID)
    }
  }

  private func dynamicIsland(
    _ context: ActivityViewContext<VoltraAttributes>
  ) -> DynamicIsland {
    let window = restWindow(in: context.state)
    return DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        if window != nil {
          RestLabel()
        } else {
          Voltra(root: voltraRoot(for: .islandExpandedLeading, in: context.state), activityId: context.activityID)
        }
      }
      DynamicIslandExpandedRegion(.trailing) {
        if let window {
          RestCountdown(range: window.range, size: 18, color: RestStyle.accent)
        } else {
          Voltra(root: voltraRoot(for: .islandExpandedTrailing, in: context.state), activityId: context.activityID)
        }
      }
      DynamicIslandExpandedRegion(.center) {
        if window == nil {
          Voltra(root: voltraRoot(for: .islandExpandedCenter, in: context.state), activityId: context.activityID)
        }
      }
      DynamicIslandExpandedRegion(.bottom) {
        if let window {
          ProgressView(timerInterval: window.range, countsDown: true)
            .tint(RestStyle.accent)
            .padding(.top, 4)
        } else {
          Voltra(root: voltraRoot(for: .islandExpandedBottom, in: context.state), activityId: context.activityID)
        }
      }
    } compactLeading: {
      if window != nil {
        Image(systemName: "timer")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(RestStyle.accent)
      } else {
        Voltra(root: voltraRoot(for: .islandCompactLeading, in: context.state), activityId: context.activityID)
      }
    } compactTrailing: {
      if let window {
        RestCountdown(range: window.range, size: 14, color: RestStyle.accent)
      } else {
        Voltra(root: voltraRoot(for: .islandCompactTrailing, in: context.state), activityId: context.activityID)
      }
    } minimal: {
      if window != nil {
        Image(systemName: "timer")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(RestStyle.accent)
      } else {
        Voltra(root: voltraRoot(for: .islandMinimal, in: context.state), activityId: context.activityID)
      }
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
