import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import type { MuscleStats } from '../../types/api.types';

type MetricMode = 'raw' | 'net';

interface Props {
  muscles: MuscleStats[];
}

interface AggregatedGroup {
  group: string;
  label: string;
  regions: string[];
  rawStimulus: number;
  atrophy: number;
  netStimulus: number;
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

function getStimulusColor(value: number, maxValue: number): string {
  if (maxValue <= 0) return '#4B5563';
  const pct = Math.max(0, Math.min(1, value / maxValue));
  if (pct >= 0.8) return '#22C55E';
  if (pct >= 0.6) return '#4ADE80';
  if (pct >= 0.4) return '#86EFAC';
  if (pct >= 0.2) return '#F59E0B';
  return '#EF4444';
}

function buildGroups(muscles: MuscleStats[]): AggregatedGroup[] {
  const byGroup = new Map<string, AggregatedGroup>();

  for (const muscle of muscles) {
    const existing = byGroup.get(muscle.parent_group);
    if (existing) {
      existing.rawStimulus += muscle.stimulus;
      existing.atrophy += muscle.atrophy;
      existing.netStimulus += muscle.net_stimulus;
      existing.regions.push(muscle.region_id);
    } else {
      byGroup.set(muscle.parent_group, {
        group: muscle.parent_group,
        label: formatGroupLabel(muscle.parent_group),
        regions: [muscle.region_id],
        rawStimulus: muscle.stimulus,
        atrophy: muscle.atrophy,
        netStimulus: muscle.net_stimulus,
      });
    }
  }

  return Array.from(byGroup.values());
}

export default function GroupSummaryCards({ muscles }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>('raw');

  const groups = useMemo(() => buildGroups(muscles), [muscles]);
  const sorted = useMemo(
    () => [...groups].sort((a, b) => (metricMode === 'raw' ? b.rawStimulus - a.rawStimulus : b.netStimulus - a.netStimulus)),
    [groups, metricMode],
  );
  const maxStimulus = useMemo(
    () => Math.max(...sorted.map((group) => (metricMode === 'raw' ? group.rawStimulus : group.netStimulus)), 1),
    [sorted, metricMode],
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
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Stimulus by Group</Text>
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
      {sorted.map((group) => {
        const value = metricMode === 'raw' ? group.rawStimulus : group.netStimulus;
        const barColor = getStimulusColor(value, maxStimulus);
        const widthPct = Math.max((value / maxStimulus) * 100, 3);
        const isActive = activeGroup === group.group;

        return (
          <Pressable
            key={group.group}
            style={styles.row}
            onHoverIn={() => setActiveGroup(group.group)}
            onHoverOut={() => setActiveGroup((current) => (current === group.group ? null : current))}
            onPressIn={() => setActiveGroup(group.group)}
            onPressOut={() => setActiveGroup((current) => (current === group.group ? null : current))}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.groupName} numberOfLines={1}>
                {group.label}
              </Text>
              <Text style={styles.meta}>{value.toFixed(2)}</Text>
            </View>

            <Text style={styles.subMeta} numberOfLines={1}>
              {group.regions.length} regions{metricMode === 'net' ? ` · ${group.atrophy.toFixed(2)} atrophy` : ''}
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
