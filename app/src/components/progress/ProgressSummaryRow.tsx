import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { type SessionDataPoint, computeTrend } from './progressTransforms';

interface Props {
  points: SessionDataPoint[];
}

export default function ProgressSummaryRow({ points }: Props) {
  const trend = computeTrend(points);
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const sessions = points.length;

  const trendIcon: keyof typeof Ionicons.glyphMap =
    trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
  const trendColor =
    trend === 'up' ? colors.green : trend === 'down' ? colors.red : colors.textSecondary;
  const trendLabel =
    trend === 'up' ? 'Progressing' : trend === 'down' ? 'Declining' : 'Stable';

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Ionicons name={trendIcon} size={18} color={trendColor} />
        <Text style={[styles.value, { color: trendColor }]}>{trendLabel}</Text>
        <Text style={styles.label}>Trend</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.cell}>
        <Text style={styles.value}>{latest ? `${latest.weight}lb` : '\u2014'}</Text>
        <Text style={styles.label}>Latest</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.cell}>
        <Text style={styles.value}>{sessions}</Text>
        <Text style={styles.label}>Sessions</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    width: 0.5,
    height: 32,
    backgroundColor: colors.border,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
