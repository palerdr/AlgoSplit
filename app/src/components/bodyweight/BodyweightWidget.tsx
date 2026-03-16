import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBodyweight } from '../../hooks/useBodyweight';
import { colors } from '../../theme';

const CHART_W = 140;
const CHART_H = 40;
const PAD = 4;

function MiniTrendLine({ data }: { data: Array<{ weight: number }> }) {
  const path = useMemo(() => {
    if (data.length < 2) return null;

    const weights = data.map((d) => d.weight);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const range = max - min || 1;

    const w = CHART_W - PAD * 2;
    const h = CHART_H - PAD * 2;
    const step = w / (data.length - 1);

    const points = data.map((d, i) => ({
      x: PAD + i * step,
      y: PAD + (1 - (d.weight - min) / range) * h,
    }));

    // Build smooth path using cardinal spline
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    return { d, lastPoint: points[points.length - 1] };
  }, [data]);

  if (!path) return null;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Path d={path.d} stroke={colors.green} strokeWidth={1.5} fill="none" />
      <Circle
        cx={path.lastPoint.x}
        cy={path.lastPoint.y}
        r={3}
        fill={colors.green}
      />
    </Svg>
  );
}

export default function BodyweightWidget() {
  const router = useRouter();
  const { stats, chartData, isLoading, weightUnit, logWeight, isLogging } =
    useBodyweight();
  const [input, setInput] = useState('');

  const recentData = useMemo(() => chartData.slice(-14), [chartData]);

  const handleLog = useCallback(() => {
    const value = parseFloat(input);
    if (isNaN(value) || value <= 0) return;
    logWeight(value);
    setInput('');
    Keyboard.dismiss();
  }, [input, logWeight]);

  const trendIcon =
    stats?.trendDirection === 'up'
      ? 'trending-up'
      : stats?.trendDirection === 'down'
        ? 'trending-down'
        : 'remove-outline';

  const trendColor =
    stats?.trendDirection === 'up'
      ? colors.blue
      : stats?.trendDirection === 'down'
        ? colors.green
        : colors.textMuted;

  if (isLoading) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push('/more/bodyweight')}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="scale-outline" size={14} color={colors.textMuted} />
          <Text style={styles.title}>Bodyweight</Text>
        </View>
        {stats && (
          <View style={styles.currentRow}>
            <Text style={styles.currentWeight}>
              {stats.current.toFixed(1)} {weightUnit}
            </Text>
            <Ionicons name={trendIcon} size={14} color={trendColor} />
          </View>
        )}
      </View>

      {/* Chart or empty state */}
      {recentData.length >= 2 ? (
        <View style={styles.chartRow}>
          <MiniTrendLine data={recentData} />
          {stats && (
            <View style={styles.changeCol}>
              <Text
                style={[
                  styles.changeValue,
                  { color: stats.change > 0 ? colors.blue : stats.change < 0 ? colors.green : colors.textMuted },
                ]}
              >
                {stats.change > 0 ? '+' : ''}
                {stats.change.toFixed(1)} {weightUnit}
              </Text>
              <Text style={styles.changeLabel}>total</Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.emptyText}>
          {recentData.length === 1 ? 'Log more to see trend' : 'No entries yet'}
        </Text>
      )}

      {/* Quick log input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={`Log weight (${weightUnit})`}
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
          <Ionicons
            name="add"
            size={18}
            color={!input || isLogging ? colors.textDim : colors.bg}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentWeight: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  changeCol: {
    alignItems: 'flex-end',
  },
  changeValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  changeLabel: {
    color: colors.textMuted,
    fontSize: 10,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
    paddingVertical: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  logBtn: {
    backgroundColor: colors.green,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
});
