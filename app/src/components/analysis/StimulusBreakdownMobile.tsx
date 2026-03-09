import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borders, spacing } from '../../theme';
import type { SessionBreakdown, ExerciseBreakdown, MuscleContribution } from '../../types/api.types';

const TIER_COLORS: Record<string, string> = {
  prime: '#DC2626',
  secondary: '#F59E0B',
  tertiary: '#3B82F6',
  quaternary: '#6B7280',
};

function getCnsColor(multiplier: number): string {
  if (multiplier >= 0.9) return '#22C55E';
  if (multiplier >= 0.8) return '#EAB308';
  return '#F97316';
}

function TierBadge({ tier }: { tier: string }) {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  const bg = TIER_COLORS[tier] ?? colors.textMuted;
  return (
    <View style={[styles.tierBadge, { backgroundColor: bg + '22', borderColor: bg + '66' }]}>
      <Text style={[styles.tierBadgeText, { color: bg }]}>{label}</Text>
    </View>
  );
}

function ContributionRow({ c }: { c: MuscleContribution }) {
  return (
    <View style={styles.contribRow}>
      <Text style={styles.contribMuscle} numberOfLines={1}>{c.display_name}</Text>
      <TierBadge tier={c.tier} />
      <Text style={styles.contribValue}>{c.total_stimulus.toFixed(2)}</Text>
    </View>
  );
}

function ExerciseCard({ exercise }: { exercise: ExerciseBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const totalStimulus = exercise.muscle_contributions.reduce((s, c) => s + c.total_stimulus, 0);

  return (
    <View style={styles.exerciseCard}>
      <TouchableOpacity style={styles.exerciseHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.exerciseHeaderLeft}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.exerciseName} numberOfLines={1}>{exercise.name}</Text>
        </View>
        <View style={styles.exerciseHeaderRight}>
          {exercise.is_unilateral && (
            <View style={styles.uniBadge}>
              <Text style={styles.uniBadgeText}>UNI</Text>
            </View>
          )}
          <View style={styles.patternBadge}>
            <Text style={styles.patternText}>{exercise.sets}s</Text>
          </View>
          <Text style={styles.exerciseStimulus}>{totalStimulus.toFixed(1)}</Text>
        </View>
      </TouchableOpacity>

      {expanded && exercise.muscle_contributions.length > 0 && (
        <View style={styles.contribList}>
          {exercise.muscle_contributions
            .sort((a, b) => b.total_stimulus - a.total_stimulus)
            .map((c) => (
              <ContributionRow key={c.muscle_id} c={c} />
            ))}
        </View>
      )}
    </View>
  );
}

interface Props {
  sessionBreakdowns: SessionBreakdown[];
}

export default function StimulusBreakdownMobile({ sessionBreakdowns }: Props) {
  const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(new Set());

  const toggleSession = (index: number) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!sessionBreakdowns || sessionBreakdowns.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No breakdown data available</Text>
      </View>
    );
  }

  return (
    <View>
      {sessionBreakdowns.map((session, idx) => {
        const collapsed = collapsedSessions.has(idx);
        return (
          <View key={idx} style={styles.sessionSection}>
            <TouchableOpacity style={styles.sessionHeader} onPress={() => toggleSession(idx)}>
              <Ionicons
                name={collapsed ? 'chevron-forward' : 'chevron-down'}
                size={16}
                color={colors.textSecondary}
              />
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionName}>{session.session_name}</Text>
                <Text style={styles.sessionDay}>Day {session.day_number}</Text>
              </View>
              <View style={styles.sessionBadges}>
                <View style={styles.setsBadge}>
                  <Text style={styles.setsBadgeText}>{session.cumulative_sets} sets</Text>
                </View>
                <View style={[styles.cnsBadge, { borderColor: getCnsColor(session.final_cns_multiplier) }]}>
                  <Text style={[styles.cnsBadgeText, { color: getCnsColor(session.final_cns_multiplier) }]}>
                    CNS {(session.final_cns_multiplier * 100).toFixed(0)}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {!collapsed && (
              <View style={styles.exerciseList}>
                {session.exercises.map((ex, exIdx) => (
                  <ExerciseCard key={exIdx} exercise={ex} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sessionSection: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: 8,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sessionDay: {
    color: colors.textMuted,
    fontSize: 11,
  },
  sessionBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  setsBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radius.sm,
  },
  setsBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  cnsBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radius.sm,
  },
  cnsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  exerciseList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  exerciseCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    marginBottom: 6,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  exerciseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  exerciseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  uniBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  uniBadgeText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
  },
  patternBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  patternText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  exerciseStimulus: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  contribList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  contribMuscle: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  contribValue: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
});
