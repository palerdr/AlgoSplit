import ActivityKit
import SwiftUI
import WidgetKit
import VoltraWidget

private enum AlgoSplitLiveActivityStyle {
  static let accent = Color(red: 65 / 255, green: 196 / 255, blue: 110 / 255)
  static let background = Color(red: 13 / 255, green: 13 / 255, blue: 13 / 255)
  static let text = Color(red: 241 / 255, green: 236 / 255, blue: 228 / 255)
  static let secondaryText = Color(red: 138 / 255, green: 133 / 255, blue: 124 / 255)
  static let deepLink = URL(string: "algosplit://")!
}

private struct RestTiming {
  let start: Date
  let end: Date

  init?(parameters: TimerParameters) {
    guard let startAtMs = parameters.startAtMs,
          let endAtMs = parameters.endAtMs,
          endAtMs > startAtMs
    else { return nil }

    start = Date(timeIntervalSince1970: startAtMs / 1_000)
    end = Date(timeIntervalSince1970: endAtMs / 1_000)
  }
}

private func timerParameters(in node: VoltraNode) -> TimerParameters? {
  switch node {
  case let .element(element):
    if element.type == "Timer" {
      return element.parameters(TimerParameters.self)
    }
    guard let children = element.children else { return nil }
    return timerParameters(in: children)
  case let .array(nodes):
    return nodes.lazy.compactMap(timerParameters(in:)).first
  case .text, .empty:
    return nil
  }
}

private func restTiming(in state: VoltraAttributes.ContentState) -> RestTiming? {
  for region in VoltraRegion.allCases {
    guard let nodes = state.regions[region] else { continue }
    for node in nodes {
      if let parameters = timerParameters(in: node),
         let timing = RestTiming(parameters: parameters)
      {
        return timing
      }
    }
  }
  return nil
}

private func rootNode(
  for region: VoltraRegion,
  in state: VoltraAttributes.ContentState
) -> VoltraNode {
  let nodes = state.regions[region] ?? []
  if nodes.isEmpty { return .empty }
  return nodes.count == 1 ? nodes[0] : .array(nodes)
}

private struct RestRegionView: View {
  let region: VoltraRegion
  let context: ActivityViewContext<VoltraAttributes>

  @ViewBuilder
  var body: some View {
    if let timing = restTiming(in: context.state) {
      // The activity is created with staleDate equal to the rest deadline.
      // ActivityKit updates this flag even while the host app is suspended.
      if context.isStale {
        completionContent
      } else if region == .islandMinimal {
        RestProgressDial(timing: timing)
      } else {
        payloadContent
      }
    } else {
      // Transient completion updates contain no Timer. Render their Voltra
      // regions directly so foreground/native completion updates still work.
      payloadContent
    }
  }

  private var payloadContent: some View {
    Voltra(
      root: rootNode(for: region, in: context.state),
      activityId: context.activityID
    )
  }

  @ViewBuilder
  private var completionContent: some View {
    switch region {
    case .lockScreen:
      RestLockScreenCompletionView()
    case .islandExpandedCenter:
      RestExpandedCompletionView()
    case .islandExpandedBottom:
      RestExpandedActionView()
    case .islandCompactTrailing, .islandMinimal:
      RestCompletionMark()
    case .islandExpandedLeading,
         .islandExpandedTrailing,
         .islandCompactLeading,
         .supplementalActivityFamiliesSmall:
      EmptyView()
    }
  }
}

private struct RestProgressDial: View {
  let timing: RestTiming

  var body: some View {
    ProgressView(
      timerInterval: timing.start ... timing.end,
      countsDown: true
    )
    // Date-relative progress views must use their automatic system style;
    // that keeps the countdown moving without widget refreshes.
    .tint(AlgoSplitLiveActivityStyle.accent)
    .frame(width: 22, height: 22)
  }
}

private struct RestCompletionMark: View {
  var body: some View {
    Image(systemName: "checkmark")
      .font(.system(size: 13, weight: .bold))
      .foregroundStyle(AlgoSplitLiveActivityStyle.accent)
  }
}

private struct RestLockScreenCompletionView: View {
  var body: some View {
    Link(destination: AlgoSplitLiveActivityStyle.deepLink) {
      HStack(spacing: 10) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(AlgoSplitLiveActivityStyle.accent)

        VStack(alignment: .leading, spacing: 2) {
          Text("Time for your set")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(AlgoSplitLiveActivityStyle.text)
          Text("Back to workout")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(AlgoSplitLiveActivityStyle.secondaryText)
        }

        Spacer()

        Image(systemName: "chevron.right")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(AlgoSplitLiveActivityStyle.secondaryText)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
    }
  }
}

private struct RestExpandedCompletionView: View {
  var body: some View {
    HStack(spacing: 9) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(AlgoSplitLiveActivityStyle.accent)
      Text("Time for your set")
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(AlgoSplitLiveActivityStyle.text)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 6)
  }
}

private struct RestExpandedActionView: View {
  var body: some View {
    Link(destination: AlgoSplitLiveActivityStyle.deepLink) {
      HStack(spacing: 7) {
        Text("Back to workout")
          .font(.system(size: 15, weight: .bold))
        Image(systemName: "arrow.right")
          .font(.system(size: 13, weight: .semibold))
      }
      .foregroundStyle(AlgoSplitLiveActivityStyle.accent)
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
    }
  }
}

@available(iOS 18.0, *)
private struct RestAdaptiveActivityView: View {
  let context: ActivityViewContext<VoltraAttributes>

  @Environment(\.activityFamily) private var activityFamily

  @ViewBuilder
  var body: some View {
    if activityFamily == .small {
      smallContent
    } else {
      RestRegionView(region: .lockScreen, context: context)
    }
  }

  @ViewBuilder
  private var smallContent: some View {
    let supplemental = context.state.regions[.supplementalActivityFamiliesSmall] ?? []
    let leading = context.state.regions[.islandCompactLeading] ?? []
    let trailing = context.state.regions[.islandCompactTrailing] ?? []

    if !supplemental.isEmpty {
      RestRegionView(region: .supplementalActivityFamiliesSmall, context: context)
    } else if !leading.isEmpty || !trailing.isEmpty {
      HStack(spacing: 0) {
        if !leading.isEmpty {
          RestRegionView(region: .islandCompactLeading, context: context)
        }
        Spacer()
        if !trailing.isEmpty {
          RestRegionView(region: .islandCompactTrailing, context: context)
        }
      }
      .frame(maxWidth: .infinity)
    } else {
      EmptyView()
    }
  }
}

private struct AlgoSplitRestLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    if #available(iOS 18.0, *) {
      return adaptiveConfiguration()
    } else {
      return defaultConfiguration()
    }
  }

  private func defaultConfiguration() -> some WidgetConfiguration {
    ActivityConfiguration(for: VoltraAttributes.self) { context in
      RestRegionView(region: .lockScreen, context: context)
        .widgetURL(AlgoSplitLiveActivityStyle.deepLink)
        .activityBackgroundTint(AlgoSplitLiveActivityStyle.background)
    } dynamicIsland: { context in
      dynamicIsland(context: context)
    }
  }

  @available(iOS 18.0, *)
  private func adaptiveConfiguration() -> some WidgetConfiguration {
    ActivityConfiguration(for: VoltraAttributes.self) { context in
      RestAdaptiveActivityView(context: context)
        .widgetURL(AlgoSplitLiveActivityStyle.deepLink)
        .activityBackgroundTint(AlgoSplitLiveActivityStyle.background)
    } dynamicIsland: { context in
      dynamicIsland(context: context)
    }
    .supplementalActivityFamilies([.small, .medium])
  }

  private func dynamicIsland(
    context: ActivityViewContext<VoltraAttributes>
  ) -> DynamicIsland {
    DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        RestRegionView(region: .islandExpandedLeading, context: context)
      }
      DynamicIslandExpandedRegion(.trailing) {
        RestRegionView(region: .islandExpandedTrailing, context: context)
      }
      DynamicIslandExpandedRegion(.center) {
        RestRegionView(region: .islandExpandedCenter, context: context)
      }
      DynamicIslandExpandedRegion(.bottom) {
        RestRegionView(region: .islandExpandedBottom, context: context)
      }
    } compactLeading: {
      // Keeping this side empty prevents the active rest timer from spanning
      // the full camera cutout. Icon + countdown remain on the trailing side.
      EmptyView()
    } compactTrailing: {
      RestRegionView(region: .islandCompactTrailing, context: context)
        .fixedSize(horizontal: true, vertical: true)
    } minimal: {
      RestRegionView(region: .islandMinimal, context: context)
    }
    .keylineTint(AlgoSplitLiveActivityStyle.accent)
  }
}

@main
struct VoltraWidgetBundle: WidgetBundle {
  var body: some Widget {
    AlgoSplitRestLiveActivityWidget()
  }
}
