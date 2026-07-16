import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { theme } from '../../theme';
import {
  ChartPoint,
  SessionDataPoint,
  normalizeScores,
  progressColor,
  splineSegments,
} from './progressTransforms';

const CHART_HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

export default function ProgressSplineChart({ points }: { points: SessionDataPoint[] }) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);
  const normalized = useMemo(() => normalizeScores(points), [points]);
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
    setTappedIndex((previous) => (previous === index ? null : index));
  }, []);

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
      onPress={() => setTappedIndex(null)}
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
              r={tappedIndex === index ? 6 : 4}
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
        />
      ))}

      {tappedIndex !== null && chartPoints[tappedIndex] && (
        <View
          style={[
            styles.tooltip,
            {
              left: Math.min(Math.max(chartPoints[tappedIndex].x - 64, 8), containerWidth - 136),
              top: Math.max(chartPoints[tappedIndex].y - 82, 4),
            },
          ]}
        >
          <Text style={styles.tooltipDate}>
            {points[tappedIndex].date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            })}
          </Text>
          <Text style={styles.tooltipSession} numberOfLines={1}>
            {points[tappedIndex].sessionName} · Set {points[tappedIndex].setNumber}
          </Text>
          <Text style={styles.tooltipLine}>
            {points[tappedIndex].weight}lb × {points[tappedIndex].reps}
            {points[tappedIndex].rir !== null ? ` @${points[tappedIndex].rir} RIR` : ''}
          </Text>
          <Text style={styles.tooltipScore}>
            Capacity {Math.round(points[tappedIndex].capacityScore)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: CHART_HEIGHT, position: 'relative' },
  hitTarget: { position: 'absolute', width: 36, height: 36, borderRadius: 18 },
  tooltip: {
    position: 'absolute',
    width: 128,
    backgroundColor: theme.surfaceHigh,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    zIndex: 10,
  },
  tooltipDate: { color: theme.textDim, fontSize: 10 },
  tooltipSession: { color: theme.textDim, fontSize: 10, marginTop: 2 },
  tooltipLine: { color: theme.text, fontSize: 12, marginTop: 3 },
  tooltipScore: { color: theme.accent, fontSize: 10, marginTop: 2 },
});
