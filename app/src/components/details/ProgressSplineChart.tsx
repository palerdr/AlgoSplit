import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { theme } from '../../theme';
import Tooltip from '../../ui/Tooltip';
import {
  ChartPoint,
  SessionDataPoint,
  normalizeScores,
  progressColor,
  splineSegments,
} from './progressTransforms';

const CHART_HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const TOOLTIP_WIDTH = 128;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_POINT_GAP = 5;

export default function ProgressSplineChart({ points }: { points: SessionDataPoint[] }) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const normalized = useMemo(() => normalizeScores(points), [points]);
  const pointsIdentity = useMemo(
    () =>
      JSON.stringify(
        points.map((point) =>
          [
            point.date.getTime(),
            point.sessionName,
            point.weight,
            point.reps,
            point.rir ?? '',
            point.capacityScore,
            point.setNumber,
          ]
        )
      ),
    [points]
  );
  const chartWidth = containerWidth - PAD.left - PAD.right;
  const chartHeight = CHART_HEIGHT - PAD.top - PAD.bottom;

  const { yMin, yMax } = useMemo(() => {
    const weights = points.map((point) => point.weight);
    if (weights.length === 0) return { yMin: 0, yMax: 100 };
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const padding = Math.max((max - min) * 0.15, 5);
    return { yMin: Math.max(0, min - padding), yMax: max + padding };
  }, [points]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (chartWidth <= 0 || chartHeight <= 0) return [];
    const range = yMax - yMin || 1;
    const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;
    return points.map((point, index) => ({
      x: PAD.left + index * step,
      y: PAD.top + (1 - (point.weight - yMin) / range) * chartHeight,
    }));
  }, [points, chartWidth, chartHeight, yMin, yMax]);

  const segments = useMemo(() => splineSegments(chartPoints), [chartPoints]);
  const gridLines = useMemo(() => {
    if (chartHeight <= 0) return [];
    const range = yMax - yMin || 1;
    return Array.from({ length: 5 }, (_, index) => {
      const value = yMin + ((yMax - yMin) / 4) * index;
      return {
        y: PAD.top + (1 - (value - yMin) / range) * chartHeight,
        label: Math.round(value).toString(),
      };
    });
  }, [chartHeight, yMin, yMax]);

  const selectPoint = useCallback((index: number) => {
    if (tooltipClosing) {
      setPendingIndex(index);
      return;
    }
    if (selectedIndex === index) {
      if (tooltipVisible) {
        setPendingIndex(null);
        setTooltipClosing(true);
        setTooltipVisible(false);
      } else {
        setTooltipVisible(true);
      }
      return;
    }
    if (tooltipVisible && selectedIndex !== null) {
      setPendingIndex(index);
      setTooltipClosing(true);
      setTooltipVisible(false);
      return;
    }
    setSelectedIndex(index);
    setTooltipVisible(true);
  }, [selectedIndex, tooltipClosing, tooltipVisible]);

  const hideTooltip = useCallback(() => {
    if (!tooltipVisible && !tooltipClosing) return;
    setPendingIndex(null);
    setTooltipClosing(true);
    setTooltipVisible(false);
  }, [tooltipClosing, tooltipVisible]);

  const showPendingTooltip = useCallback(() => {
    setTooltipClosing(false);
    if (pendingIndex !== null) {
      setSelectedIndex(pendingIndex);
      setTooltipVisible(true);
    }
    setPendingIndex(null);
  }, [pendingIndex]);

  useEffect(() => {
    setSelectedIndex(null);
    setPendingIndex(null);
    setTooltipVisible(false);
    setTooltipClosing(false);
  }, [pointsIdentity]);

  useEffect(() => {
    const selectedInvalid = selectedIndex !== null && !chartPoints[selectedIndex];
    const pendingInvalid = pendingIndex !== null && !chartPoints[pendingIndex];
    if (!selectedInvalid && !pendingInvalid) return;
    setSelectedIndex(null);
    setPendingIndex(null);
    setTooltipVisible(false);
    setTooltipClosing(false);
  }, [chartPoints, pendingIndex, selectedIndex]);

  const selectedChartPoint = selectedIndex === null ? null : chartPoints[selectedIndex] ?? null;
  const tooltipWidth = Math.max(1, Math.min(TOOLTIP_WIDTH, containerWidth - TOOLTIP_MARGIN * 2));
  const tooltipLeft = selectedChartPoint
    ? Math.min(
        Math.max(selectedChartPoint.x - tooltipWidth / 2, TOOLTIP_MARGIN),
        Math.max(TOOLTIP_MARGIN, containerWidth - tooltipWidth - TOOLTIP_MARGIN)
      )
    : TOOLTIP_MARGIN;
  const caretInset = Math.min(10, tooltipWidth / 2);
  const tooltipCaretOffset = selectedChartPoint
    ? Math.min(
        tooltipWidth - caretInset,
        Math.max(caretInset, selectedChartPoint.x - tooltipLeft)
      )
    : tooltipWidth / 2;
  const tooltipAbove = (selectedChartPoint?.y ?? 0) >= 80;

  if (points.length === 0) return null;
  const firstDate = points[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const lastDate = points[points.length - 1].date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable
      style={styles.container}
      onLayout={(event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width)}
      onPress={hideTooltip}
      accessible={false}
      focusable={false}
      tabIndex={-1}
    >
      {containerWidth > 0 && (
        <Svg width={containerWidth} height={CHART_HEIGHT}>
          {gridLines.map((line, index) => (
            <G key={index}>
              <Line
                x1={PAD.left}
                y1={line.y}
                x2={containerWidth - PAD.right}
                y2={line.y}
                stroke={theme.border}
                strokeWidth={0.5}
              />
              <SvgText
                x={PAD.left - 6}
                y={line.y + 4}
                fill={theme.textDim}
                fontSize={10}
                textAnchor="end"
              >
                {line.label}
              </SvgText>
            </G>
          ))}
          {chartPoints.length > 0 && (
            <>
              <SvgText x={chartPoints[0].x} y={CHART_HEIGHT - 4} fill={theme.textDim} fontSize={10}>
                {firstDate}
              </SvgText>
              {points.length > 1 && (
                <SvgText
                  x={chartPoints[chartPoints.length - 1].x}
                  y={CHART_HEIGHT - 4}
                  fill={theme.textDim}
                  fontSize={10}
                  textAnchor="end"
                >
                  {lastDate}
                </SvgText>
              )}
            </>
          )}
          {segments.map((segment, index) => {
            const color = progressColor((normalized[index] + normalized[index + 1]) / 2);
            const path = `M ${segment.start.x},${segment.start.y} C ${segment.cp1.x},${segment.cp1.y} ${segment.cp2.x},${segment.cp2.y} ${segment.end.x},${segment.end.y}`;
            return <Path key={index} d={path} stroke={color} strokeWidth={2.5} fill="none" />;
          })}
          {chartPoints.map((point, index) => (
            <Circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={tooltipVisible && selectedIndex === index ? 6 : 4}
              fill={progressColor(normalized[index])}
              stroke={theme.bg}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      )}

      {chartPoints.map((point, index) => (
        <Pressable
          key={index}
          style={[styles.hitTarget, { left: point.x - 18, top: point.y - 18 }]}
          onPress={() => selectPoint(index)}
          accessibilityRole="button"
          accessibilityLabel={`${points[index].date.toLocaleDateString()}, ${points[index].sessionName}, set ${points[index].setNumber}, ${points[index].weight} pounds by ${points[index].reps} reps${
            points[index].rir !== null ? ` at ${points[index].rir} reps in reserve` : ''
          }, capacity ${Math.round(points[index].capacityScore)}`}
          accessibilityHint="Shows details for this progress point"
          accessibilityState={{ selected: tooltipVisible && selectedIndex === index }}
        />
      ))}

      {selectedIndex !== null && selectedChartPoint && (
        <Tooltip
          visible={tooltipVisible}
          pointer={tooltipAbove ? 'bottom' : 'top'}
          caretOffset={tooltipCaretOffset}
          maxWidth={tooltipWidth}
          bubbleStyle={[styles.tooltipBubble, { width: tooltipWidth }]}
          onHidden={showPendingTooltip}
          style={[
            styles.tooltipPosition,
            {
              left: tooltipLeft,
              ...(tooltipAbove
                ? { bottom: CHART_HEIGHT - selectedChartPoint.y + TOOLTIP_POINT_GAP }
                : { top: selectedChartPoint.y + TOOLTIP_POINT_GAP }),
            },
          ]}
        >
          <Text style={styles.tooltipDate} numberOfLines={1}>
            {points[selectedIndex].date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            })}
          </Text>
          <Text style={styles.tooltipSession} numberOfLines={1}>
            {points[selectedIndex].sessionName} · Set {points[selectedIndex].setNumber}
          </Text>
          <Text style={styles.tooltipLine} numberOfLines={1}>
            {points[selectedIndex].weight}lb × {points[selectedIndex].reps}
            {points[selectedIndex].rir !== null ? ` @${points[selectedIndex].rir} RIR` : ''}
          </Text>
          <Text style={styles.tooltipScore} numberOfLines={1}>
            Capacity {Math.round(points[selectedIndex].capacityScore)}
          </Text>
        </Tooltip>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: CHART_HEIGHT, position: 'relative' },
  hitTarget: { position: 'absolute', width: 36, height: 36, borderRadius: 18 },
  tooltipPosition: {
    position: 'absolute',
    zIndex: 10,
  },
  tooltipBubble: {
    minWidth: 1,
  },
  tooltipDate: { color: theme.textDim, fontSize: 9, lineHeight: 12, fontWeight: '400' },
  tooltipSession: {
    color: theme.textDim,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  tooltipLine: {
    color: theme.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  tooltipScore: {
    color: theme.accent,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '400',
    marginTop: 1,
  },
});
