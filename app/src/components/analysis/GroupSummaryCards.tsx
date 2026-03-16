import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import type { MuscleGroupSummary } from '../../types/api.types';

const GROUP_COLORS: Record<string, string> = {
  chest: '#EF4444',
  shoulders: '#F97316',
  upper_back: '#EAB308',
  lats: '#84CC16',
  lower_back: '#22C55E',
  biceps: '#06B6D4',
  triceps: '#14B8A6',
  forearms: '#0EA5E9',
  quads: '#3B82F6',
  hamstrings: '#6366F1',
  glutes: '#8B5CF6',
  calves: '#A855F7',
  adductors: '#EC4899',
  abs: '#F43F5E',
};

function formatGroupName(group: string): string {
  return group
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface Props {
  groups: MuscleGroupSummary[];
}

export default function GroupSummaryCards({ groups }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...groups].sort((a, b) => b.total_net_stimulus - a.total_net_stimulus),
    [groups],
  );
  const maxStimulus = useMemo(
    () => Math.max(...sorted.map((g) => g.total_net_stimulus), 1),
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
        const barColor = GROUP_COLORS[g.group] ?? colors.textMuted;
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
                {formatGroupName(g.group)}
              </Text>
              <Text style={styles.meta}>
                {g.total_sets} sets
              </Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
              {isActive ? (
                <View style={styles.valuePill}>
                  <Text style={styles.valueText}>{g.total_net_stimulus.toFixed(1)}</Text>
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
