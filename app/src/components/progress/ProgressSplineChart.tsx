import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { colors } from '../../theme';
import { useSettingsStore } from '../../stores/settingsStore';
import { convertLbToDisplay } from '../../utils/unitConversion';
import {
  type SessionDataPoint,
  type ChartPoint,
  normalizeScores,
  progressColor,
  splineSegments,
} from './progressTransforms';

const CHART_HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

interface Props {
  points: SessionDataPoint[];
}

export default function ProgressSplineChart({ points }: Props) {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  const normalized = useMemo(() => normalizeScores(points), [points]);

  const chartW = containerWidth - PAD.left - PAD.right;
  const chartH = CHART_HEIGHT - PAD.top - PAD.bottom;

  // Y data range
  const { yMin, yMax } = useMemo(() => {
    if (points.length === 0)
      return { yMin: 0, yMax: 100 };
    const weights = points.map((p) => p.weight);
    const wMin = Math.min(...weights);
    const wMax = Math.max(...weights);
    const pad = Math.max((wMax - wMin) * 0.15, 5);
    return {
      yMin: Math.max(0, wMin - pad),
      yMax: wMax + pad,
    };
  }, [points]);

  // Data → pixel coordinates
  const chartPoints = useMemo((): ChartPoint[] => {
    if (chartW <= 0 || chartH <= 0) return [];
    const yRange = yMax - yMin || 1;
    const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
    return points.map((p, index) => ({
      x: PAD.left + index * xStep,
      y: PAD.top + (1 - (p.weight - yMin) / yRange) * chartH,
    }));
  }, [points, chartW, chartH, yMin, yMax]);

  const segments = useMemo(() => splineSegments(chartPoints), [chartPoints]);

  // Horizontal grid lines (4 divisions)
  const gridLines = useMemo(() => {
    if (chartH <= 0) return [];
    const lines: Array<{ y: number; label: string }> = [];
    const yRange = yMax - yMin || 1;
    const step = (yMax - yMin) / 4;
    for (let i = 0; i <= 4; i++) {
      const val = yMin + step * i;
      const y = PAD.top + (1 - (val - yMin) / yRange) * chartH;
      lines.push({ y, label: Math.round(val).toString() });
    }
    return lines;
  }, [yMin, yMax, chartH]);

  // X-axis date labels: first and last only
  const xLabels = useMemo(() => {
    if (points.length === 0 || chartPoints.length === 0) return [];
    if (points.length === 1) {
      return [{
        x: chartPoints[0].x,
        label: points[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        anchor: 'middle' as const,
      }];
    }
    return [
      {
        x: chartPoints[0].x,
        label: points[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        anchor: 'start' as const,
      },
      {
        x: chartPoints[chartPoints.length - 1].x,
        label: points[points.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        anchor: 'end' as const,
      },
    ];
  }, [points, chartPoints]);

  const handleDotPress = useCallback((index: number) => {
    setTappedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (points.length === 0) return null;

  return (
    <View style={styles.container} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <Svg width={containerWidth} height={CHART_HEIGHT}>
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <G key={`g${i}`}>
              <Line
                x1={PAD.left}
                y1={line.y}
                x2={containerWidth - PAD.right}
                y2={line.y}
                stroke={colors.border}
                strokeWidth={0.5}
              />
              <SvgText
                x={PAD.left - 6}
                y={line.y + 4}
                fill={colors.textMuted}
                fontSize={10}
                textAnchor="end"
              >
                {line.label}
              </SvgText>
            </G>
          ))}

          {/* X labels */}
          {xLabels.map((label, i) => (
            <SvgText
              key={`x${i}`}
              x={label.x}
              y={CHART_HEIGHT - 4}
              fill={colors.textMuted}
              fontSize={10}
              textAnchor={label.anchor}
            >
              {label.label}
            </SvgText>
          ))}

          {/* Spline segments — colored by normalized progress */}
          {segments.map((seg, i) => {
            const avgNorm = (normalized[i] + normalized[i + 1]) / 2;
            const color = progressColor(avgNorm);
            const d = `M ${seg.start.x},${seg.start.y} C ${seg.cp1.x},${seg.cp1.y} ${seg.cp2.x},${seg.cp2.y} ${seg.end.x},${seg.end.y}`;
            return (
              <Path key={`s${i}`} d={d} stroke={color} strokeWidth={2.5} fill="none" />
            );
          })}

          {/* Data point dots */}
          {chartPoints.map((cp, i) => (
            <Circle
              key={`d${i}`}
              cx={cp.x}
              cy={cp.y}
              r={tappedIndex === i ? 6 : 4}
              fill={progressColor(normalized[i])}
              stroke={colors.bg}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      )}

      {containerWidth > 0 &&
        chartPoints.map((cp, i) => (
          <Pressable
            key={`hit-${i}`}
            style={[
              styles.dotHitTarget,
              {
                left: cp.x - 18,
                top: cp.y - 18,
              },
            ]}
            onPress={() => handleDotPress(i)}
          />
        ))}

      {/* Tooltip overlay */}
      {tappedIndex != null && chartPoints[tappedIndex] && (
        <Pressable
          style={[
            styles.tooltip,
            {
              left: Math.min(
                Math.max(chartPoints[tappedIndex].x - 60, 8),
                containerWidth - 128,
              ),
              top: Math.max(chartPoints[tappedIndex].y - 68, 4),
            },
          ]}
          onPress={() => setTappedIndex(null)}
        >
          <Text style={styles.tooltipDate}>
            {points[tappedIndex].date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            })}
          </Text>
          <Text style={styles.tooltipSession}>
            {points[tappedIndex].sessionName} · Set {points[tappedIndex].setNumber}
          </Text>
          <Text style={styles.tooltipLine}>
            {convertLbToDisplay(points[tappedIndex].weight, weightUnit)}{weightUnit} x {points[tappedIndex].reps}
            {points[tappedIndex].rir != null ? ` @${points[tappedIndex].rir}RIR` : ''}
          </Text>
          <Text style={styles.tooltipScore}>
            Score: {Math.round(points[tappedIndex].capacityScore)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: CHART_HEIGHT,
    position: 'relative',
  },
  dotHitTarget: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 120,
    zIndex: 10,
  },
  tooltipDate: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  tooltipLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipSession: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  tooltipScore: {
    color: colors.green,
    fontSize: 11,
    marginTop: 2,
  },
});
