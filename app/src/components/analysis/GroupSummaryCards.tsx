import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

function getRating(net: number): { label: string; color: string } {
  if (net >= 5) return { label: 'Excellent', color: '#22C55E' };
  if (net >= 4) return { label: 'Great', color: '#10B981' };
  if (net >= 3) return { label: 'Good', color: '#14B8A6' };
  if (net >= 2) return { label: 'Moderate', color: '#EAB308' };
  if (net >= 1) return { label: 'Low', color: '#F97316' };
  return { label: 'Minimal', color: '#EF4444' };
}

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
  const sorted = [...groups].sort((a, b) => b.total_net_stimulus - a.total_net_stimulus);

  return (
    <View style={styles.grid}>
      {sorted.map((g) => {
        const borderColor = GROUP_COLORS[g.group] ?? colors.textMuted;
        const rating = getRating(g.total_net_stimulus);
        return (
          <View key={g.group} style={[styles.card, { borderLeftColor: borderColor }]}>
            <Text style={styles.groupName}>{formatGroupName(g.group)}</Text>
            <Text style={styles.stimulus}>{g.total_net_stimulus.toFixed(1)}</Text>
            <Text style={[styles.rating, { color: rating.color }]}>{rating.label}</Text>
            <Text style={styles.subtitle}>
              {g.total_sets} sets | {g.regions.length} regions
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: spacing.md,
  },
  groupName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  stimulus: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  rating: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
