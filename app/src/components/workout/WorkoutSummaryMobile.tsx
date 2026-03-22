import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WorkoutExercise } from '../../stores/workoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { convertLbToDisplay } from '../../utils/unitConversion';
import { colors } from '../../theme';

interface WorkoutSummaryMobileProps {
  sessionName: string;
  startedAt: string;
  exercises: WorkoutExercise[];
}

export default function WorkoutSummaryMobile({
  sessionName,
  startedAt,
  exercises,
}: WorkoutSummaryMobileProps) {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const elapsedMin = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
  const exercisesWithData = exercises.filter((ex) => ex.sets.some((s) => s.reps > 0));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{sessionName}</Text>
        <View style={styles.bannerRow}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.bannerTime}>{elapsedMin} min</Text>
        </View>
      </View>

      {exercisesWithData.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="barbell-outline" size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>No sets recorded yet</Text>
        </View>
      ) : (
        exercisesWithData.map((exercise) => {
          const validSets = exercise.sets.filter((s) => s.reps > 0);
          const totalReps = validSets.reduce((sum, s) => sum + s.reps, 0);
          const totalVol = validSets.reduce(
            (sum, s) => sum + s.reps * convertLbToDisplay(s.weight, weightUnit),
            0,
          );

          return (
            <View key={exercise.id} style={styles.exerciseCard}>
              <Text style={styles.exName}>{exercise.name}</Text>
              <Text style={styles.exMeta}>
                {validSets.length} sets · {totalReps} reps · {Math.round(totalVol).toLocaleString()} {weightUnit}
              </Text>
              <View style={styles.chips}>
                {validSets.map((s, i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{convertLbToDisplay(s.weight, weightUnit)}×{s.reps}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  banner: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  bannerTime: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  exName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  exMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
