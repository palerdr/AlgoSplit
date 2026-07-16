import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { workoutRangeKey } from '../../api/accountData';
import { SplitResponse } from '../../api/backend';
import { WorkoutTemplate } from '../../data/templates';
import { getExercise } from '../../data/exercises';
import { CompletedWorkout } from '../../state/AppState';
import { emptyWorkoutResource, useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import FadeIn from '../../ui/FadeIn';
import Glass from '../../ui/Glass';
import ProgressSplineChart from './ProgressSplineChart';
import {
  ProgressWorkout,
  computeTrend,
  extractSessionPoints,
  getExerciseNamesFromWorkouts,
} from './progressTransforms';

type TimeRange = '1M' | '6M' | 'All';
const RANGE_DAYS: Record<Exclude<TimeRange, 'All'>, number> = { '1M': 30, '6M': 180 };

function localWorkouts(history: CompletedWorkout[]): ProgressWorkout[] {
  return history.map((workout) => ({
    completed_at: workout.date,
    session_name: workout.name,
    exercises: workout.exercises.map((exercise) => ({
      exercise_name: exercise.name,
      reps: exercise.records.map((record) => record.reps),
      weight: exercise.records.map((record) => record.weight),
      rir: exercise.records.some((record) => record.rir !== undefined)
        ? exercise.records.map((record) => record.rir ?? 0)
        : null,
    })),
  }));
}

function splitExerciseItems(splits: SplitResponse[]): Array<{ name: string; source: string }> {
  const seen = new Set<string>();
  const items: Array<{ name: string; source: string }> = [];
  for (const split of splits) {
    for (const session of split.sessions) {
      for (const exercise of session.exercises) {
        const key = exercise.exercise_name.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ name: exercise.exercise_name, source: `${split.name} · ${session.name}` });
      }
    }
  }
  return items;
}

function demoExerciseItems(templates: WorkoutTemplate[]): Array<{ name: string; source: string }> {
  const seen = new Set<string>();
  const items: Array<{ name: string; source: string }> = [];
  for (const template of templates) {
    for (const templateExercise of template.exercises) {
      const exercise = getExercise(templateExercise.exerciseId);
      if (!exercise) continue;
      const key = exercise.name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name: exercise.name, source: `${template.name} · demo` });
    }
  }
  return items;
}

function Notice({
  title,
  body,
  action,
  onAction,
  delay = 0,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <Glass style={styles.notice}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
        {action && onAction && (
          <Pressable onPress={onAction}>
            <Text style={styles.action}>{action}</Text>
          </Pressable>
        )}
      </Glass>
    </FadeIn>
  );
}

function ExercisePicker({
  visible,
  items,
  onClose,
  onSelect,
}: {
  visible: boolean;
  items: Array<{ name: string; source: string }>;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? items.filter((item) => item.name.toLocaleLowerCase().includes(query)) : items;
  }, [items, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select exercise</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises"
          placeholderTextColor={theme.textDim}
          autoCorrect={false}
          style={styles.search}
        />
        <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
          {filtered.slice(0, 30).map((item) => (
            <Pressable
              key={item.name.toLocaleLowerCase()}
              style={styles.pickerRow}
              onPress={() => {
                onSelect(item.name);
                setSearch('');
              }}
            >
              <Text style={styles.pickerName}>{item.name}</Text>
              <Text style={styles.pickerSource}>{item.source}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && <Text style={styles.empty}>No exercises found</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ProgressTab({
  history,
  templates,
}: {
  history: CompletedWorkout[];
  templates: WorkoutTemplate[];
}) {
  const account = useAccountState();
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const days = timeRange === 'All' ? undefined : RANGE_DAYS[timeRange];
  const rangeKey = workoutRangeKey(days);
  const remote = account.workoutRanges[rangeKey] ?? emptyWorkoutResource();
  const demoMode = account.status === 'signedOut' || account.status === 'unconfigured';

  useEffect(() => {
    if (account.status === 'authenticated') account.refreshWorkouts(days);
  }, [account.status, account.refreshWorkouts, days]);

  const workouts = useMemo<ProgressWorkout[]>(() => {
    if (!demoMode) return remote.data;
    const cutoff = days === undefined ? 0 : Date.now() - days * 86_400_000;
    return localWorkouts(history).filter(
      (workout) => new Date(workout.completed_at).getTime() >= cutoff
    );
  }, [demoMode, remote.data, history, days]);

  const exerciseItems = useMemo(() => {
    const base = demoMode
      ? demoExerciseItems(templates)
      : splitExerciseItems(account.splits.data);
    const seen = new Set(base.map((item) => item.name.toLocaleLowerCase()));
    for (const name of getExerciseNamesFromWorkouts(workouts)) {
      const key = name.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        base.push({ name, source: demoMode ? 'Demo history' : 'Recently logged' });
      }
    }
    return base;
  }, [demoMode, templates, account.splits.data, workouts]);

  useEffect(() => {
    const available = new Set(exerciseItems.map((item) => item.name.toLocaleLowerCase()));
    if (selectedExercise && available.has(selectedExercise.toLocaleLowerCase())) return;
    const recent = getExerciseNamesFromWorkouts(workouts)[0];
    setSelectedExercise(recent ?? exerciseItems[0]?.name ?? null);
  }, [exerciseItems, workouts, selectedExercise]);

  const points = useMemo(
    () => (selectedExercise ? extractSessionPoints(workouts, selectedExercise) : []),
    [workouts, selectedExercise]
  );
  const bodyweightOnly =
    selectedExercise !== null &&
    points.length === 0 &&
    workouts.some((workout) =>
      workout.exercises.some(
        (exercise) =>
          exercise.exercise_name.toLocaleLowerCase() === selectedExercise.toLocaleLowerCase() &&
          exercise.weight.every((weight) => weight === 0)
      )
    );

  if (account.status === 'checking') {
    return <Notice title="Checking your account" body="Loading your authenticated data source…" />;
  }
  if (account.status === 'error') {
    return (
      <Notice
        title="Account connection failed"
        body={account.sessionError ?? 'Could not verify your account. Local data is not substituted here.'}
        action="Retry"
        onAction={account.refreshSession}
      />
    );
  }

  const trend = computeTrend(points);
  const latest = points[points.length - 1];
  const trendLabel = trend === 'up' ? 'Progressing' : trend === 'down' ? 'Declining' : 'Stable';

  return (
    <View>
      {demoMode && (
        <Notice
          title="Demo data"
          body="Sign in from History to replace these local examples with your account history."
        />
      )}

      <FadeIn delay={45}>
        <View style={styles.rangeRow}>
          {(['1M', '6M', 'All'] as TimeRange[]).map((range) => (
            <Pressable key={range} onPress={() => setTimeRange(range)}>
              <Glass style={styles.chip} interactive>
                <Text style={[styles.chipText, timeRange === range && styles.chipTextActive]}>
                  {range}
                </Text>
              </Glass>
            </Pressable>
          ))}
        </View>
      </FadeIn>

      {!demoMode && remote.error ? (
        <Notice
          title="Progress could not load"
          body={`${remote.error} Your local demo history was not used.`}
          action="Retry"
          onAction={() => account.refreshWorkouts(days)}
          delay={90}
        />
      ) : !demoMode && remote.loading && !remote.loaded ? (
        <Notice
          title="Loading progress"
          body="Fetching your complete workout history…"
          delay={90}
        />
      ) : (
        <>
          <FadeIn delay={90}>
            <Pressable onPress={() => setPickerOpen(true)}>
              <Glass style={styles.selector} interactive>
                <View>
                  <Text style={styles.selectorLabel}>Exercise</Text>
                  <Text style={styles.selectorName}>{selectedExercise ?? 'Select exercise'}</Text>
                </View>
                <Text style={styles.action}>Change</Text>
              </Glass>
            </Pressable>
          </FadeIn>

          {bodyweightOnly ? (
            <Notice
              title="Bodyweight exercise"
              body="Weight-based capacity tracking is not available for zero-weight sets."
              delay={135}
            />
          ) : points.length === 0 ? (
            <Notice
              title="No data yet"
              body={`Log ${selectedExercise ?? 'an exercise'} with weight to see its progress curve.`}
              delay={135}
            />
          ) : (
            <>
              <FadeIn delay={135}>
                <Glass style={styles.chartCard}>
                  <Text style={styles.chartTitle}>Weight · capacity gradient</Text>
                  <ProgressSplineChart points={points} />
                </Glass>
              </FadeIn>
              <FadeIn delay={180}>
                <Glass style={styles.summary}>
                  <View style={styles.summaryCell}>
                    <Text
                      style={[
                        styles.summaryValue,
                        trend === 'up' && { color: theme.accent },
                        trend === 'down' && { color: theme.textDim },
                      ]}
                    >
                      {trendLabel}
                    </Text>
                    <Text style={styles.summaryLabel}>Trend</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryValue}>{latest ? `${latest.weight}lb` : '—'}</Text>
                    <Text style={styles.summaryLabel}>Latest</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryValue}>{points.length}</Text>
                    <Text style={styles.summaryLabel}>Sessions</Text>
                  </View>
                </Glass>
              </FadeIn>
            </>
          )}
        </>
      )}

      <ExercisePicker
        visible={pickerOpen}
        items={exerciseItems}
        onClose={() => setPickerOpen(false)}
        onSelect={(name) => {
          setSelectedExercise(name);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 18, padding: 16, marginBottom: 14 },
  noticeTitle: { color: theme.text, fontSize: 15, fontWeight: '600', marginBottom: 5 },
  noticeBody: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  action: { color: theme.accent, fontSize: 12, fontWeight: '600', marginTop: 8 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: theme.accent },
  selector: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorLabel: {
    color: theme.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectorName: { color: theme.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
  chartCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  chartTitle: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summary: {
    borderRadius: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryValue: { color: theme.text, fontSize: 14, fontWeight: '700' },
  summaryLabel: {
    color: theme.textDim,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
    marginVertical: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  close: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  search: {
    color: theme.text,
    backgroundColor: theme.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    margin: 16,
  },
  pickerList: { paddingHorizontal: 18, paddingBottom: 16 },
  pickerRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 10,
  },
  pickerName: { color: theme.text, fontSize: 14, fontWeight: '500' },
  pickerSource: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  empty: { color: theme.textDim, fontSize: 13, textAlign: 'center', padding: 20 },
});
