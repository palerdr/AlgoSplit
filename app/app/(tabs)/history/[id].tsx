import { View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWorkout, useDeleteWorkout } from '../../../src/hooks/useWorkouts';
import { Spinner } from '../../../src/components/ui';
import { confirm } from '../../../src/utils/confirm';
import { colors, borders, spacing } from '../../../src/theme';

export default function WorkoutDetailScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: workout, isLoading } = useWorkout(id);
  const deleteMutation = useDeleteWorkout();

  const handleDelete = () => {
    if (!id) return;
    confirm('Delete Workout', 'This cannot be undone.', 'Delete', async () => {
      try {
        await deleteMutation.mutateAsync(id);
        router.back();
      } catch {
        if (Platform.OS === 'web') window.alert('Failed to delete workout.');
      }
    });
  };

  if (isLoading) return <Spinner fullScreen />;
  if (!workout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Workout not found</Text>
      </View>
    );
  }

  const date = new Date(workout.completed_at);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{workout.session_name}</Text>
        <TouchableOpacity onPress={handleDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={colors.red} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{dateStr} at {timeStr}</Text>
          </View>
          {workout.duration_minutes != null && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>{workout.duration_minutes} min</Text>
            </View>
          )}
        </View>

        {workout.notes && (
          <Text style={styles.notes}>{workout.notes}</Text>
        )}

        {/* Exercises */}
        {workout.exercises.map((ex) => (
          <View key={ex.id} style={styles.exerciseCard}>
            <Text style={styles.exName}>{ex.exercise_name}</Text>
            <Text style={styles.exSets}>{ex.sets_completed} sets</Text>

            {/* Column headers */}
            <View style={styles.setHeader}>
              <Text style={[styles.setHeaderText, { width: 32 }]}>Set</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>Weight</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
              {ex.rir && <Text style={[styles.setHeaderText, { flex: 0.7 }]}>RIR</Text>}
            </View>

            {ex.reps.map((reps, i) => (
              <View key={i} style={styles.setRow}>
                <Text style={[styles.setNum, { width: 32 }]}>{i + 1}</Text>
                <Text style={[styles.setValue, { flex: 1 }]}>{ex.weight[i]} lbs</Text>
                <Text style={[styles.setValue, { flex: 1 }]}>{reps}</Text>
                {ex.rir && (
                  <Text style={[styles.setValue, { flex: 0.7 }]}>
                    {ex.rir[i] != null ? ex.rir[i] : '—'}
                  </Text>
                )}
              </View>
            ))}

            {ex.notes && <Text style={styles.exNotes}>{ex.notes}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  notes: {
    color: colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 8,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 12,
  },
  exName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  exSets: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  setHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  setHeaderText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  setNum: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  setValue: {
    color: colors.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  exNotes: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
