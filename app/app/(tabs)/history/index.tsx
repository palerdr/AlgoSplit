import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWorkoutHistorySummaries } from '../../../src/hooks/useWorkouts';
import { startPerfSpan } from '../../../src/dev/perfTrace';
import { Spinner, InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import ProgressTabPanel from '../../../src/components/progress/ProgressTabPanel';
import { colors, borders, spacing } from '../../../src/theme';
import type { WorkoutSummaryResponse } from '../../../src/types/api.types';

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeView, setActiveView] = useState<'log' | 'progress'>('progress');
  const screenLoadSpanRef = useRef<ReturnType<typeof startPerfSpan> | null>(null);
  const { data: history, isLoading, refetch, isRefetching } = useWorkoutHistorySummaries({ limit: 100 });

  const workouts = history?.workouts ?? [];

  useEffect(() => {
    if (activeView !== 'log') return;

    if (isLoading && !screenLoadSpanRef.current) {
      screenLoadSpanRef.current = startPerfSpan('mobile:history:screen-load', {
        limit: 100,
      });
      return;
    }

    if (!isLoading && screenLoadSpanRef.current) {
      screenLoadSpanRef.current({
        rows: workouts.length,
      });
      screenLoadSpanRef.current = null;
    }
  }, [activeView, isLoading, workouts.length]);

  const renderWorkout = ({ item }: { item: WorkoutSummaryResponse }) => {
    const metaParts = [
      item.duration_minutes != null ? `${item.duration_minutes}m` : null,
      `${item.total_sets} sets`,
      `${item.exercise_count} exercises`,
    ].filter(Boolean);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tabs)/history/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.session_name}</Text>
          <Text style={styles.cardDate}>{formatRelativeDate(item.completed_at)}</Text>
        </View>
        <Text style={styles.cardMetaLine}>{metaParts.join(' · ')}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>History</Text>
        <InfoButton title={HELP_CONTENT['history.overview'].title} body={HELP_CONTENT['history.overview'].body} />
      </View>
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.switchBtn, activeView === 'progress' && styles.switchBtnActive]}
          onPress={() => setActiveView('progress')}
        >
          <Text style={[styles.switchText, activeView === 'progress' && styles.switchTextActive]}>Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, activeView === 'log' && styles.switchBtnActive]}
          onPress={() => setActiveView('log')}
        >
          <Text style={[styles.switchText, activeView === 'log' && styles.switchTextActive]}>Log</Text>
        </TouchableOpacity>
      </View>

      {activeView === 'progress' ? (
        <View style={styles.progressWrap}>
          <ProgressTabPanel />
        </View>
      ) : isLoading ? (
        <Spinner style={{ marginTop: 40 }} />
      ) : workouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="fitness-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Workouts Yet</Text>
          <Text style={styles.emptySubtitle}>Start a workout from a split to log your first session</Text>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(w) => w.id}
          renderItem={renderWorkout}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.textSecondary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    paddingBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  switchBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  switchBtnActive: {
    backgroundColor: colors.surfaceElevated,
  },
  switchText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  switchTextActive: {
    color: colors.text,
  },
  progressWrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  cardDate: {
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  cardMetaLine: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
