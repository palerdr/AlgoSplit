import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import type { MuscleStats } from '../../types/api.types';

function getStimulusColor(value: number, maxValue: number): string {
  if (maxValue <= 0) return '#4B5563';
  const pct = Math.max(0, Math.min(1, value / maxValue));
  if (pct >= 0.8) return '#22C55E';
  if (pct >= 0.6) return '#4ADE80';
  if (pct >= 0.4) return '#86EFAC';
  if (pct >= 0.2) return '#F59E0B';
  return '#EF4444';
}

interface Props {
  muscles: MuscleStats[];
}

export default function GroupSummaryCards({ muscles }: Props) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...muscles].sort((a, b) => b.net_stimulus - a.net_stimulus),
    [muscles],
  );
  const maxStimulus = useMemo(
    () => Math.max(...sorted.map((m) => m.net_stimulus), 1),
    [sorted],
  );

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No group data available yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartCard}>
      {sorted.map((g) => {
        const barColor = getStimulusColor(g.net_stimulus, maxStimulus);
        const widthPct = Math.max((g.net_stimulus / maxStimulus) * 100, 3);
        const isActive = activeRegion === g.region_id;
        const totalSets = g.prime_sets + g.secondary_sets + g.tertiary_sets;

        return (
          <Pressable
            key={g.region_id}
            style={styles.row}
            onHoverIn={() => setActiveRegion(g.region_id)}
            onHoverOut={() => setActiveRegion((current) => (current === g.region_id ? null : current))}
            onPressIn={() => setActiveRegion(g.region_id)}
            onPressOut={() => setActiveRegion((current) => (current === g.region_id ? null : current))}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.groupName} numberOfLines={1}>
                {g.display_name}
              </Text>
              <Text style={styles.meta}>{totalSets.toFixed(1)} sets</Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
              {isActive ? (
                <View style={styles.valuePill}>
                  <Text style={styles.valueText}>{g.net_stimulus.toFixed(2)}</Text>
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
  row: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  groupName: {
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
