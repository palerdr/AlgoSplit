import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkoutLogResponse } from '../../api/backend';
import { emptyWorkoutResource, useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import FadeIn from '../../ui/FadeIn';
import Glass from '../../ui/Glass';
import { formatLoggedSet, sortWorkoutHistory, workoutTotals } from './historyTransforms';

const DAY_MS = 86_400_000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function formatVolume(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function Notice({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <FadeIn>
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

function WorkoutCard({ workout, delay }: { workout: WorkoutLogResponse; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const totals = workoutTotals(workout);

  return (
    <FadeIn delay={delay}>
      <Pressable onPress={() => setExpanded((value) => !value)}>
        <Glass style={styles.card} interactive>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle}>{workout.session_name}</Text>
              <Text style={styles.cardDate}>{formatDate(workout.completed_at)}</Text>
            </View>
            <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.stat}>
              <Text style={styles.statValue}>{totals.sets}</Text> sets
            </Text>
            <Text style={styles.stat}>
              <Text style={styles.statValue}>{workout.exercises.length}</Text> exercises
            </Text>
            <Text style={styles.stat}>
              <Text style={styles.statValue}>{formatVolume(totals.volume)}</Text> lb
            </Text>
            {workout.duration_minutes != null && (
              <Text style={styles.stat}>
                <Text style={styles.statValue}>{workout.duration_minutes}</Text> min
              </Text>
            )}
          </View>

          {expanded && (
            <View style={styles.details}>
              {workout.notes && <Text style={styles.workoutNotes}>{workout.notes}</Text>}
              {workout.exercises.map((exercise, exerciseIndex) => (
                <View
                  key={exercise.id || `${exercise.exercise_name}-${exerciseIndex}`}
                  style={[styles.exercise, exerciseIndex > 0 && styles.exerciseBorder]}
                >
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
                    <Text style={styles.exerciseCount}>{exercise.sets_completed} sets</Text>
                  </View>
                  {exercise.reps.map((_, setIndex) => (
                    <View key={setIndex} style={styles.setRow}>
                      <Text style={styles.setNumber}>{setIndex + 1}</Text>
                      <Text style={styles.setValue}>{formatLoggedSet(exercise, setIndex)}</Text>
                    </View>
                  ))}
                  {exercise.notes && <Text style={styles.exerciseNotes}>{exercise.notes}</Text>}
                </View>
              ))}
            </View>
          )}
        </Glass>
      </Pressable>
    </FadeIn>
  );
}

export default function HistoryTab() {
  const account = useAccountState();
  const remote = account.workoutRanges.all ?? emptyWorkoutResource();

  useEffect(() => {
    if (account.status === 'authenticated') account.refreshWorkouts();
  }, [account.status, account.refreshWorkouts]);

  const workouts = useMemo(() => sortWorkoutHistory(remote.data), [remote.data]);

  if (account.status === 'unconfigured') {
    return (
      <Notice
        title="Account history is not configured"
        body="Set EXPO_PUBLIC_ALGOSPLIT_API and restart the app to connect this view to the workout route."
      />
    );
  }
  if (account.status === 'signedOut') {
    return <Notice title="Signed out" body="Sign in from the account screen to view history." />;
  }
  if (account.status === 'checking') {
    return <Notice title="Checking your account" body="Restoring your authenticated session…" />;
  }
  if (account.status === 'error') {
    return (
      <Notice
        title="Account connection failed"
        body={account.sessionError ?? 'Could not verify your account.'}
        action="Retry"
        onAction={account.refreshSession}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FadeIn>
        <View style={styles.accountRow}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountLabel}>Account history</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>
              {account.user?.email ?? 'Authenticated'}
            </Text>
          </View>
          <Pressable onPress={() => account.refreshWorkouts()} hitSlop={8}>
            <Text style={styles.accountAction}>Refresh</Text>
          </Pressable>
          <Pressable onPress={() => account.logout()} hitSlop={8}>
            <Text style={styles.accountAction}>Log out</Text>
          </Pressable>
        </View>
      </FadeIn>

      {remote.error ? (
        <Notice
          title="History could not load"
          body={`${remote.error} Local demo workouts were not substituted.`}
          action="Retry"
          onAction={() => account.refreshWorkouts()}
        />
      ) : remote.loading && !remote.loaded ? (
        <Notice title="Loading history" body="Fetching your complete workout history…" />
      ) : workouts.length === 0 ? (
        <Notice title="No workouts yet" body="Finish a workout and it will appear here." />
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(workout) => workout.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <WorkoutCard workout={item} delay={45 + Math.min(index, 6) * 45} />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 40 },
  notice: { borderRadius: 18, padding: 16, marginBottom: 14 },
  noticeTitle: { color: theme.text, fontSize: 15, fontWeight: '600', marginBottom: 5 },
  noticeBody: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  action: { color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 10 },
  gate: { borderRadius: 20, padding: 18 },
  gateTitle: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  gateBody: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    color: theme.text,
    fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 9,
  },
  authRow: { flexDirection: 'row', gap: 9, marginTop: 4 },
  authPressable: { flex: 1 },
  authButton: { borderRadius: 15, paddingVertical: 11, alignItems: 'center' },
  authButtonText: { color: theme.text, fontSize: 13, fontWeight: '700' },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 3,
    marginBottom: 14,
  },
  accountCopy: { flex: 1 },
  accountLabel: { color: theme.text, fontSize: 13, fontWeight: '600' },
  accountEmail: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  accountAction: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 20, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 7 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  cardDate: { color: theme.textDim, fontSize: 11, marginTop: 3 },
  chevron: { color: theme.textDim, fontSize: 16 },
  exerciseSummary: { color: theme.textDim, fontSize: 12, lineHeight: 17, marginBottom: 11 },
  statRow: {
    flexDirection: 'row',
    gap: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 10,
  },
  stat: { color: theme.textDim, fontSize: 12 },
  statValue: { color: theme.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  details: { marginTop: 13 },
  workoutNotes: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 11,
    marginBottom: 10,
  },
  exercise: { paddingVertical: 10 },
  exerciseBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  exerciseName: { color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 },
  exerciseCount: { color: theme.textDim, fontSize: 11 },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 25 },
  setNumber: { color: theme.textDim, width: 24, fontSize: 11 },
  setValue: { color: theme.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  exerciseNotes: { color: theme.textDim, fontSize: 11, lineHeight: 16, marginTop: 6 },
});
