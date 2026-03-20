import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import type { MuscleGroupSummary } from '../../types/api.types';

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
  groups: MuscleGroupSummary[];
}

const GROUP_LABELS: Record<string, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  upper_back: 'Upper Back',
  lower_back: 'Lower Back',
  lats: 'Lats',
  triceps: 'Triceps',
  elbow_flexors: 'Elbow Flexors',
  forearms: 'Forearms',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  adductors: 'Adductors',
  abs: 'Abs',
  core: 'Core',
};

function formatGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function GroupSummaryCards({ groups }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...groups].sort((a, b) => b.total_net_stimulus - a.total_net_stimulus),
    [groups],
  );
  const maxStimulus = useMemo(
    () => Math.max(...sorted.map((group) => group.total_net_stimulus), 1),
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
        const barColor = getStimulusColor(g.total_net_stimulus, maxStimulus);
        const widthPct = Math.max((g.total_net_stimulus / maxStimulus) * 100, 3);
        const isActive = activeGroup === g.group;

        return (
          <Pressable
            key={g.group}
            style={styles.row}
            onHoverIn={() => setActiveGroup(g.group)}
            onHoverOut={() => setActiveGroup((current) => (current === g.group ? null : current))}
            onPressIn={() => setActiveGroup(g.group)}
            onPressOut={() => setActiveGroup((current) => (current === g.group ? null : current))}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.groupName} numberOfLines={1}>
                {formatGroupLabel(g.group)}
              </Text>
              <Text style={styles.meta}>{g.total_net_stimulus.toFixed(2)}</Text>
            </View>

            <Text style={styles.subMeta} numberOfLines={1}>
              {g.regions.length} regions
            </Text>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
              {isActive ? (
                <View style={styles.valuePill}>
                  <Text style={styles.valueText}>{g.total_net_stimulus.toFixed(2)}</Text>
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
  subMeta: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: -2,
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
