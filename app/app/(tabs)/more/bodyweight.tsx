import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { useBodyweight } from '../../../src/hooks/useBodyweight';
import { colors } from '../../../src/theme';
import { convertLbToDisplay } from '../../../src/utils/unitConversion';
import type { BodyweightEntryResponse } from '../../../src/types/api.types';

const CHART_HEIGHT = 200;
const CHART_PAD = { top: 12, right: 16, bottom: 24, left: 40 };

function WeightChart({ data }: { data: Array<{ date: Date; weight: number }> }) {
  const [containerWidth, setContainerWidth] = useState(0);

  const chartW = containerWidth - CHART_PAD.left - CHART_PAD.right;
  const chartH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;

  const { yMin, yMax, points, pathD, gridLines, xLabels } = useMemo(() => {
    if (data.length < 2 || chartW <= 0 || chartH <= 0) {
      return { yMin: 0, yMax: 100, points: [], pathD: '', gridLines: [], xLabels: [] };
    }

    const weights = data.map((d) => d.weight);
    const wMin = Math.min(...weights);
    const wMax = Math.max(...weights);
    const pad = Math.max((wMax - wMin) * 0.15, 2);
    const yMinVal = Math.max(0, wMin - pad);
    const yMaxVal = wMax + pad;
    const yRange = yMaxVal - yMinVal || 1;

    const step = chartW / (data.length - 1);
    const pts = data.map((d, i) => ({
      x: CHART_PAD.left + i * step,
      y: CHART_PAD.top + (1 - (d.weight - yMinVal) / yRange) * chartH,
    }));

    // Cardinal spline
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    // Grid lines (4 divisions)
    const lines: Array<{ y: number; label: string }> = [];
    const gStep = (yMaxVal - yMinVal) / 4;
    for (let i = 0; i <= 4; i++) {
      const val = yMinVal + gStep * i;
      const y = CHART_PAD.top + (1 - (val - yMinVal) / yRange) * chartH;
      lines.push({ y, label: Math.round(val).toString() });
    }

    // X labels: first and last
    const xl = [
      {
        x: pts[0].x,
        label: data[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        anchor: 'start' as const,
      },
      {
        x: pts[pts.length - 1].x,
        label: data[data.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        anchor: 'end' as const,
      },
    ];

    return { yMin: yMinVal, yMax: yMaxVal, points: pts, pathD: d, gridLines: lines, xLabels: xl };
  }, [data, chartW, chartH]);

  if (data.length < 2) return null;

  return (
    <View style={chartStyles.container} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <Svg width={containerWidth} height={CHART_HEIGHT}>
          {gridLines.map((line, i) => (
            <G key={`g${i}`}>
              <Line
                x1={CHART_PAD.left}
                y1={line.y}
                x2={containerWidth - CHART_PAD.right}
                y2={line.y}
                stroke={colors.border}
                strokeWidth={0.5}
              />
              <SvgText x={CHART_PAD.left - 6} y={line.y + 4} fill={colors.textMuted} fontSize={10} textAnchor="end">
                {line.label}
              </SvgText>
            </G>
          ))}
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
          <Path d={pathD} stroke={colors.green} strokeWidth={2} fill="none" />
          {points.map((p, i) => (
            <Circle key={`d${i}`} cx={p.x} cy={p.y} r={3} fill={colors.green} stroke={colors.bg} strokeWidth={1} />
          ))}
        </Svg>
      )}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: CHART_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});

export default function BodyweightScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { entries, stats, chartData, isLoading, weightUnit, logWeight, isLogging, deleteEntry } =
    useBodyweight();
  const [input, setInput] = useState('');

  const handleLog = useCallback(() => {
    const value = parseFloat(input);
    if (isNaN(value) || value <= 0) return;
    logWeight(value);
    setInput('');
    Keyboard.dismiss();
  }, [input, logWeight]);

  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  const renderEntry = useCallback(
    ({ item }: { item: BodyweightEntryResponse }) => {
      const displayWeight = convertLbToDisplay(item.weight, weightUnit);
      const date = new Date(item.recorded_at);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });

      return (
        <View style={styles.entryRow}>
          <Text style={styles.entryDate}>{dateStr}</Text>
          <View style={styles.entryRight}>
            <Text style={styles.entryWeight}>
              {displayWeight.toFixed(1)} {weightUnit}
            </Text>
            <TouchableOpacity onPress={() => deleteEntry(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={14} color={colors.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [weightUnit, deleteEntry],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bodyweight</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={reversedEntries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Input card */}
            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                placeholder={`Weight (${weightUnit})`}
                placeholderTextColor={colors.textDim}
                keyboardType="decimal-pad"
                returnKeyType="done"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleLog}
              />
              <TouchableOpacity
                style={[styles.logBtn, (!input || isLogging) && styles.logBtnDisabled]}
                onPress={handleLog}
                disabled={!input || isLogging}
              >
                <Text style={[styles.logBtnText, (!input || isLogging) && styles.logBtnTextDisabled]}>
                  Log
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            {stats && (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {stats.current.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>Current ({weightUnit})</Text>
                </View>
                <View style={styles.statCard}>
                  <Text
                    style={[
                      styles.statValue,
                      { color: stats.change > 0 ? colors.blue : stats.change < 0 ? colors.green : colors.text },
                    ]}
                  >
                    {stats.change > 0 ? '+' : ''}
                    {stats.change.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>Change ({weightUnit})</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.avg7Day.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>7-Day Avg</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.count}</Text>
                  <Text style={styles.statLabel}>Entries</Text>
                </View>
              </View>
            )}

            {/* Chart */}
            {chartData.length >= 2 && <WeightChart data={chartData} />}

            {/* Entries header */}
            {entries.length > 0 && (
              <Text style={styles.sectionTitle}>Recent Entries</Text>
            )}

            {/* Empty state */}
            {!isLoading && entries.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="scale-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No Entries Yet</Text>
                <Text style={styles.emptyText}>
                  Log your weight to start tracking your trend over time.
                </Text>
              </View>
            )}
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 10,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  logBtn: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logBtnDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  logBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  logBtnTextDisabled: {
    color: colors.textDim,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  entryDate: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  entryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryWeight: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
