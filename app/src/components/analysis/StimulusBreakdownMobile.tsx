import React, { useMemo, useState } from 'react';
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

const PARENT_GROUPS: Record<string, string> = {
  clavicular: 'Chest',
  sternocostal: 'Chest',
  anterior_deltoid: 'Shoulders',
  lateral_deltoid: 'Shoulders',
  posterior_deltoid: 'Shoulders',
  trapezius: 'Upper Back',
  rhomboids: 'Upper Back',
  spinal_erectors: 'Lower Back',
  thoracic_lats: 'Lats',
  iliac_lats: 'Lats',
  biceps_brachii: 'Elbow Flexors',
  brachialis: 'Elbow Flexors',
  brachioradialis: 'Elbow Flexors',
  wrist_flexors: 'Forearms',
  wrist_extensors: 'Forearms',
  triceps_long_head: 'Triceps',
  triceps_lateral_medial: 'Triceps',
  glute_max: 'Glutes',
  glute_med_min: 'Glutes',
  vasti: 'Quads',
  rectus_femoris: 'Quads',
  hip_extensors: 'Hamstrings',
  knee_flexors: 'Hamstrings',
  gastrocnemius: 'Calves',
  soleus: 'Calves',
  hip_adductors: 'Adductors',
  anterior_core: 'Abs',
  lateral_core: 'Abs',
  deep_core: 'Abs',
};

type ViewMode = 'exercise' | 'muscle';

interface GroupContribution {
  key: string;
  exerciseName: string;
  sessionName: string;
  totalStimulus: number;
}

interface RegionAggregation {
  muscleId: string;
  displayName: string;
  totalStimulus: number;
  contributions: GroupContribution[];
}

interface MuscleGroupAggregation {
  group: string;
  totalStimulus: number;
  regions: RegionAggregation[];
}

function getCnsColor(multiplier: number): string {
  if (multiplier >= 0.9) return '#22C55E';
  if (multiplier >= 0.8) return '#EAB308';
  return '#F97316';
}

function getParentGroup(muscleId: string): string {
  return PARENT_GROUPS[muscleId] ?? 'Other';
}

function buildMuscleGroupAggregations(sessionBreakdowns: SessionBreakdown[]): MuscleGroupAggregation[] {
  const groups = new Map<string, MuscleGroupAggregation>();

  for (const session of sessionBreakdowns) {
    for (const exercise of session.exercises) {
      for (const contribution of exercise.muscle_contributions) {
        const group = getParentGroup(contribution.muscle_id);
        const existingGroup = groups.get(group);
        if (existingGroup) {
          existingGroup.totalStimulus += contribution.total_stimulus;
          const existingRegion = existingGroup.regions.find((region) => region.muscleId === contribution.muscle_id);
          if (existingRegion) {
            existingRegion.totalStimulus += contribution.total_stimulus;
            existingRegion.contributions.push({
              key: `${session.session_name}:${exercise.name}:${contribution.muscle_id}`,
              exerciseName: exercise.name,
              sessionName: session.session_name,
              totalStimulus: contribution.total_stimulus,
            });
          } else {
            existingGroup.regions.push({
              muscleId: contribution.muscle_id,
              displayName: contribution.display_name,
              totalStimulus: contribution.total_stimulus,
              contributions: [
                {
                  key: `${session.session_name}:${exercise.name}:${contribution.muscle_id}`,
                  exerciseName: exercise.name,
                  sessionName: session.session_name,
                  totalStimulus: contribution.total_stimulus,
                },
              ],
            });
          }
        } else {
          groups.set(group, {
            group,
            totalStimulus: contribution.total_stimulus,
            regions: [
              {
                muscleId: contribution.muscle_id,
                displayName: contribution.display_name,
                totalStimulus: contribution.total_stimulus,
                contributions: [
                  {
                    key: `${session.session_name}:${exercise.name}:${contribution.muscle_id}`,
                    exerciseName: exercise.name,
                    sessionName: session.session_name,
                    totalStimulus: contribution.total_stimulus,
                  },
                ],
              },
            ],
          });
        }
      }
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      regions: [...group.regions]
        .map((region) => ({
          ...region,
          contributions: [...region.contributions].sort((a, b) => b.totalStimulus - a.totalStimulus),
        }))
        .sort((a, b) => b.totalStimulus - a.totalStimulus),
    }))
    .sort((a, b) => b.totalStimulus - a.totalStimulus);
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

function formatFactor(value: number): string {
  return value.toFixed(2);
}

function ContributionRow({ c }: { c: MuscleContribution }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.contribCard}>
      <TouchableOpacity style={styles.contribRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
        <View style={styles.contribPrimary}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={colors.textMuted}
          />
          <Text style={styles.contribMuscle} numberOfLines={1}>{c.display_name}</Text>
        </View>
        <TierBadge tier={c.tier} />
        <Text style={styles.contribValue}>{c.total_stimulus.toFixed(2)}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.setEquationList}>
          {c.sets.map((set) => (
            <Text key={set.set_number} style={styles.setEquationText}>
              {`Set ${set.set_number}: ${formatFactor(set.weight)} x ${formatFactor(set.recovery_multiplier)} rec x ${formatFactor(set.bilateral_multiplier)} bil x ${formatFactor(set.local_multiplier)} local x ${formatFactor(set.global_multiplier)} cns x ${formatFactor(set.consecutive_day_multiplier)} day = ${formatFactor(set.final_stimulus)}`}
            </Text>
          ))}
        </View>
      )}
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

function MuscleGroupCard({ group }: { group: MuscleGroupAggregation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.groupCard}>
      <TouchableOpacity style={styles.groupHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.groupHeaderLeft}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.groupTitle}>{group.group}</Text>
        </View>
        <Text style={styles.groupTotal}>{group.totalStimulus.toFixed(1)}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.groupContributionList}>
          {group.regions.map((region) => (
            <RegionCard key={region.muscleId} region={region} />
          ))}
        </View>
      )}
    </View>
  );
}

function RegionCard({ region }: { region: RegionAggregation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.groupContributionCard}>
      <TouchableOpacity style={styles.groupContributionHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.groupContributionInfo}>
          <Text style={styles.groupContributionExercise}>{region.displayName}</Text>
          <Text style={styles.groupContributionSession}>{region.contributions.length} exercise contributions</Text>
        </View>
        <View style={styles.groupContributionRight}>
          <Text style={styles.groupContributionValue}>{region.totalStimulus.toFixed(2)}</Text>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.regionContributionList}>
          {region.contributions.map((contribution) => (
            <View key={contribution.key} style={styles.regionContributionRow}>
              <View style={styles.groupContributionInfo}>
                <Text style={styles.regionContributionExercise}>{contribution.exerciseName}</Text>
                <Text style={styles.groupContributionSession}>{contribution.sessionName}</Text>
              </View>
              <Text style={styles.groupContributionValue}>{contribution.totalStimulus.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <View style={styles.toggleWrap}>
      <TouchableOpacity
        style={[styles.toggleBtn, mode === 'exercise' && styles.toggleBtnActive]}
        onPress={() => onChange('exercise')}
      >
        <Text style={[styles.toggleText, mode === 'exercise' && styles.toggleTextActive]}>By Exercise</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, mode === 'muscle' && styles.toggleBtnActive]}
        onPress={() => onChange('muscle')}
      >
        <Text style={[styles.toggleText, mode === 'muscle' && styles.toggleTextActive]}>By Group</Text>
      </TouchableOpacity>
    </View>
  );
}

interface Props {
  sessionBreakdowns: SessionBreakdown[];
}

export default function StimulusBreakdownMobile({ sessionBreakdowns }: Props) {
  const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('exercise');
  const muscleGroups = useMemo(
    () => buildMuscleGroupAggregations(sessionBreakdowns),
    [sessionBreakdowns],
  );

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
      <View style={styles.breakdownHeader}>
        <Text style={styles.breakdownHint}>
          {viewMode === 'exercise'
            ? 'Inspect stimulus by split day and exercise.'
            : 'Inspect each muscle group, then drill into the sub-regions and exercise contributions inside it.'}
        </Text>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </View>

      {viewMode === 'exercise' ? (
        sessionBreakdowns.map((session, idx) => {
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
        })
      ) : (
        <View style={styles.groupList}>
          {muscleGroups.map((group) => (
            <MuscleGroupCard key={group.group} group={group} />
          ))}
        </View>
      )}
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
  breakdownHeader: {
    gap: 10,
    marginBottom: spacing.md,
  },
  breakdownHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: borders.radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.greenMuted,
  },
  toggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: colors.green,
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
  contribCard: {
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contribPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  contribMuscle: {
    color: colors.textSecondary,
    fontSize: 12,
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
  setEquationList: {
    marginTop: 6,
    marginLeft: 16,
    gap: 4,
  },
  setEquationText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  groupList: {
    gap: spacing.md,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  groupTotal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  groupContributionList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 8,
  },
  groupContributionCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  groupContributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  groupContributionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupContributionInfo: {
    flex: 1,
  },
  groupContributionExercise: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  groupContributionSession: {
    color: colors.textMuted,
    fontSize: 11,
  },
  groupContributionValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  regionContributionList: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: borders.width.thin,
    borderTopColor: colors.border,
    gap: 8,
  },
  regionContributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  regionContributionExercise: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
