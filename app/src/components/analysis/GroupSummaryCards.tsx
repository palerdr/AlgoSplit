import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import { InfoButton } from '../ui';
import { HELP_CONTENT } from '../../data/helpContent';
import { getStimulusColorForNet } from '../../analysis/stimulusScale';
import type { MuscleStats } from '../../types/api.types';

type MetricMode = 'raw' | 'net';

interface Props {
  muscles: MuscleStats[];
}

export default function GroupSummaryCards({ muscles }: Props) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>('raw');

  const sorted = useMemo(
    () => [...muscles].sort((a, b) => (metricMode === 'raw' ? b.stimulus - a.stimulus : b.net_stimulus - a.net_stimulus)),
    [muscles, metricMode],
  );
  const maxStimulus = useMemo(
    () => Math.max(...sorted.map((muscle) => (metricMode === 'raw' ? muscle.stimulus : muscle.net_stimulus)), 1),
    [sorted, metricMode],
  );

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No region data available yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Stimulus by Region</Text>
          <InfoButton title={HELP_CONTENT['splits.stimulusByGroup'].title} body={HELP_CONTENT['splits.stimulusByGroup'].body} size={15} />
        </View>
        <View style={styles.toggleWrap}>
          <TouchableOpacity
            style={[styles.toggleBtn, metricMode === 'raw' && styles.toggleBtnActive]}
            onPress={() => setMetricMode('raw')}
          >
            <Text style={[styles.toggleText, metricMode === 'raw' && styles.toggleTextActive]}>Raw</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, metricMode === 'net' && styles.toggleBtnActive]}
            onPress={() => setMetricMode('net')}
          >
            <Text style={[styles.toggleText, metricMode === 'net' && styles.toggleTextActive]}>Net</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.modeHint}>
        {metricMode === 'raw' ? 'Raw stimulus before atrophy' : 'Net stimulus after end-of-week atrophy'}
      </Text>

      {sorted.map((muscle) => {
        const value = metricMode === 'raw' ? muscle.stimulus : muscle.net_stimulus;
        // Color by absolute stimulus band (same scale as the body map) so a bar
        // is only "green" when the muscle is genuinely growing — not merely the
        // tallest bar in an otherwise under-trained split. Width stays relative
        // to the largest bar purely for visual comparison.
        const barColor = getStimulusColorForNet(value);
        const widthPct = Math.max((value / maxStimulus) * 100, 3);
        const isActive = activeRegion === muscle.region_id;

        return (
          <Pressable
            key={muscle.region_id}
            style={styles.row}
            onHoverIn={() => setActiveRegion(muscle.region_id)}
            onHoverOut={() => setActiveRegion((current) => (current === muscle.region_id ? null : current))}
            onPressIn={() => setActiveRegion(muscle.region_id)}
            onPressOut={() => setActiveRegion((current) => (current === muscle.region_id ? null : current))}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.regionName} numberOfLines={1}>
                {muscle.display_name}
              </Text>
              <Text style={styles.meta}>{value.toFixed(2)}</Text>
            </View>

            <Text style={styles.subMeta} numberOfLines={1}>
              {muscle.parent_group.replace(/_/g, ' ')}
              {metricMode === 'net' ? ` · ${muscle.atrophy.toFixed(2)} atrophy` : ''}
            </Text>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
              {isActive ? (
                <View style={styles.valuePill}>
                  <Text style={styles.valueText}>{value.toFixed(2)}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  modeHint: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borders.radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: colors.greenMuted,
  },
  toggleText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: colors.green,
  },
  row: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  regionName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  subMeta: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: -2,
    textTransform: 'capitalize',
  },
  track: {
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  valuePill: {
    position: 'absolute',
    right: 4,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 12, 16, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  valueText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
