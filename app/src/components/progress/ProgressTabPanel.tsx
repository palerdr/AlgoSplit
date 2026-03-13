import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  prefetchCompleteWorkoutHistory,
  useCompleteWorkoutHistory,
} from '../../hooks/useWorkouts';
import { useSplitsList } from '../../hooks/useSplits';
import ProgressSplineChart from './ProgressSplineChart';
import ProgressExercisePickerSheet from './ProgressExercisePickerSheet';
import type { ExercisePickerItem } from './ProgressExercisePickerSheet';
import ProgressSummaryRow from './ProgressSummaryRow';
import {
  extractSessionPoints,
  getExerciseNamesFromWorkouts,
} from './progressTransforms';
import { colors } from '../../theme';

type TimeRange = '1M' | '6M' | 'All';

const RANGE_DAYS: Record<Exclude<TimeRange, 'All'>, number> = {
  '1M': 30,
  '6M': 180,
};

interface Props {
  showHeader?: boolean;
}

export default function ProgressTabPanel({ showHeader = false }: Props) {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const queryParams = useMemo(
    () => (timeRange === 'All' ? undefined : { days: RANGE_DAYS[timeRange] }),
    [timeRange],
  );

  const {
    data: workoutData,
    isLoading,
    isFetching,
  } = useCompleteWorkoutHistory(queryParams);
  const { data: splitsData } = useSplitsList();

  const workouts = workoutData?.workouts ?? [];

  const exerciseList = useMemo((): ExercisePickerItem[] => {
    const splitExerciseNames = new Set<string>();
    const items: ExercisePickerItem[] = [];

    if (splitsData?.splits) {
      for (const split of splitsData.splits) {
        for (const session of split.sessions) {
          for (const ex of session.exercises) {
            if (!splitExerciseNames.has(ex.exercise_name)) {
              splitExerciseNames.add(ex.exercise_name);
              items.push({
                name: ex.exercise_name,
                source: `${split.name} - ${session.name}`,
              });
            }
          }
        }
      }
    }

    const recentNames = getExerciseNamesFromWorkouts(workouts);
    for (const name of recentNames) {
      if (!splitExerciseNames.has(name)) {
        items.push({ name, source: 'Recently logged' });
      }
    }

    return items;
  }, [splitsData, workouts]);

  useEffect(() => {
    if (selectedExercise) return;
    const recentNames = getExerciseNamesFromWorkouts(workouts);
    if (recentNames.length > 0) {
      setSelectedExercise(recentNames[0]);
    } else if (exerciseList.length > 0) {
      setSelectedExercise(exerciseList[0].name);
    }
  }, [workouts, exerciseList, selectedExercise]);

  useEffect(() => {
    if (!workoutData) return;

    if (timeRange === '1M') {
      prefetchCompleteWorkoutHistory(queryClient, { days: RANGE_DAYS['6M'] });
      return;
    }

    if (timeRange === '6M') {
      prefetchCompleteWorkoutHistory(queryClient);
    }
  }, [queryClient, timeRange, workoutData]);

  const sessionPoints = useMemo(() => {
    if (!selectedExercise) return [];
    return extractSessionPoints(workouts, selectedExercise);
  }, [workouts, selectedExercise]);

  const isBodyweightOnly =
    selectedExercise != null &&
    sessionPoints.length === 0 &&
    workouts.some((w) =>
      w.exercises.some(
        (e) =>
          e.exercise_name.toLowerCase() === selectedExercise.toLowerCase() &&
          e.weight.every((wt) => wt === 0),
      ),
    );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {showHeader && (
          <>
            <Text style={styles.title}>Progress</Text>
            <Text style={styles.subtitle}>Progressive overload, not noise</Text>
          </>
        )}

        <View style={styles.rangeRow}>
          {(['1M', '6M', 'All'] as TimeRange[]).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.rangeBtn, timeRange === r && styles.rangeBtnActive]}
              onPress={() => setTimeRange(r)}
            >
              <Text style={[styles.rangeText, timeRange === r && styles.rangeTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isFetching && !isLoading ? (
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={colors.green} />
            <Text style={styles.loadingPillText}>Updating range...</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.selectorCard} onPress={() => setShowPicker(true)}>
          <View style={styles.selectorLeft}>
            <Text style={styles.selectorLabel}>Exercise</Text>
            <Text style={styles.selectorName} numberOfLines={1}>
              {selectedExercise ?? 'Select exercise'}
            </Text>
          </View>
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>

        {isLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={colors.green} />
          </View>
        ) : isBodyweightOnly ? (
          <View style={styles.emptyCard}>
            <Ionicons name="body-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Bodyweight Exercise</Text>
            <Text style={styles.emptyText}>
              Weight tracking for bodyweight-only exercises is not supported in v1
            </Text>
          </View>
        ) : sessionPoints.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Data Yet</Text>
            <Text style={styles.emptyText}>
              Log workouts with {selectedExercise ?? 'this exercise'} to see your progress trend
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.chartCard}>
              <ProgressSplineChart points={sessionPoints} />
            </View>
            <ProgressSummaryRow points={sessionPoints} />
          </>
        )}
      </ScrollView>

      <ProgressExercisePickerSheet
        visible={showPicker}
        exercises={exerciseList}
        onSelect={(name) => {
          setSelectedExercise(name);
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 4,
  },
  rangeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeBtnActive: {
    backgroundColor: colors.surfaceElevated,
  },
  rangeText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  rangeTextActive: {
    color: colors.text,
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  loadingPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  selectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
  },
  selectorLeft: {
    flex: 1,
  },
  selectorLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  selectorName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  changeText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingVertical: 8,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
