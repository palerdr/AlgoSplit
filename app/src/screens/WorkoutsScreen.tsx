import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SessionTemplateResponse } from '../api/backend';
import { useAccountState } from '../state/AccountState';
import {
  AccountWorkoutEditorEntry,
  accountWorkoutEditorGroups,
} from '../workout/splitSessions';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import SplitWizard from '../components/workouts/SplitWizard';
import WorkoutEditor from '../components/workouts/WorkoutEditor';

interface WorkoutsScreenProps {
  onBack: () => void;
}

type DeleteTarget = { splitId: string; name: string };
type Mode = 'browse' | 'newSplit' | 'sessionEditor' | 'templateEditor';

const tick = () => Haptics.selectionAsync().catch(() => {});

export default function WorkoutsScreen({
  onBack,
}: WorkoutsScreenProps) {
  const account = useAccountState();
  const groups = useMemo(
    () => accountWorkoutEditorGroups(account.splits.data),
    [account.splits.data]
  );
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('browse');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingRestDay, setEditingRestDay] = useState<number | undefined>(undefined);
  // Snapshot rather than a live cache lookup: a background refresh must not
  // flip an in-progress edit between create and update mid-flight.
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplateResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedSplitId) ?? null;
  const editingSplit = account.splits.data.find((split) => split.id === selectedSplitId) ?? null;
  const editingSession =
    editingSplit?.sessions.find((session) => session.id === editingSessionId) ?? undefined;

  useEffect(() => {
    if (account.status === 'authenticated') {
      account.ensureWorkoutTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  // If a background refresh drops the split being edited (deleted elsewhere),
  // leave the editor cleanly instead of stranding the mode machine.
  useEffect(() => {
    if (mode === 'sessionEditor' && !editingSplit) {
      setMode('browse');
      setEditingSessionId(null);
      setEditingRestDay(undefined);
    }
  }, [mode, editingSplit]);

  const openSessionEditor = (
    splitId: string,
    sessionId: string | null,
    restDay?: number
  ) => {
    tick();
    setSelectedSplitId(splitId);
    setEditingSessionId(sessionId);
    setEditingRestDay(restDay);
    setMode('sessionEditor');
  };

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([account.refreshSplits(), account.refreshWorkoutTemplates()]);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await account.deleteSplit(deleteTarget.splitId);
      setSelectedSplitId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDeleteTarget(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not delete this item.');
    } finally {
      setDeleting(false);
    }
  };

  if (mode === 'newSplit') {
    return (
      <SplitWizard
        onCancel={() => setMode('browse')}
        onSaved={(saved) => {
          setSelectedSplitId(saved.id);
          setMode('browse');
        }}
      />
    );
  }

  if (mode === 'templateEditor') {
    return (
      <WorkoutEditor
        key={`template:${editingTemplate?.id ?? 'new'}`}
        mode="template"
        template={editingTemplate}
        onCancel={() => {
          setEditingTemplate(null);
          setMode('browse');
        }}
        onSaved={() => {
          setEditingTemplate(null);
          setMode('browse');
        }}
        onDelete={
          editingTemplate
            ? async () => {
                await account.deleteWorkoutTemplate(editingTemplate.id);
                setEditingTemplate(null);
                setMode('browse');
              }
            : undefined
        }
      />
    );
  }

  if (mode === 'sessionEditor' && editingSplit) {
    return (
      <WorkoutEditor
        key={`${editingSplit.id}:${editingSessionId ?? `new:${editingRestDay ?? 'open'}`}`}
        mode="session"
        split={editingSplit}
        session={editingSession}
        initialDay={editingRestDay}
        onCancel={() => {
          setEditingSessionId(null);
          setEditingRestDay(undefined);
          setMode('browse');
        }}
        onSaved={(saved) => {
          setSelectedSplitId(saved.id);
          setEditingSessionId(null);
          setEditingRestDay(undefined);
          setMode('browse');
        }}
        onDelete={
          editingSession
            ? async () => {
                await account.deleteSplitSession(editingSplit.id, editingSession.id);
                setEditingSessionId(null);
                setEditingRestDay(undefined);
                setMode('browse');
              }
            : undefined
        }
      />
    );
  }

  if (selectedGroup) {
    return (
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => {
              tick();
              setDeleteTarget(null);
              setActionError(null);
              setSelectedSplitId(null);
            }}
            hitSlop={8}
            style={styles.backWrap}
          >
            <Glass style={styles.backChip} interactive>
              <Text style={styles.backText}>‹ Workouts</Text>
            </Glass>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                account.activeSplitId === selectedGroup.id
                  ? `Deactivate ${selectedGroup.name}`
                  : `Make ${selectedGroup.name} the active split`
              }
              onPress={() => {
                tick();
                account.setActiveSplit(
                  account.activeSplitId === selectedGroup.id ? null : selectedGroup.id
                );
              }}
            >
              <Glass style={styles.headerDeleteButton} interactive>
                <Text
                  style={[
                    styles.headerActivateText,
                    account.activeSplitId === selectedGroup.id && styles.headerActivateOn,
                  ]}
                >
                  {account.activeSplitId === selectedGroup.id ? 'Active ✓' : 'Set active'}
                </Text>
              </Glass>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${selectedGroup.name} split`}
              onPress={() => {
                tick();
                setActionError(null);
                setDeleteTarget({ splitId: selectedGroup.id, name: selectedGroup.name });
              }}
              disabled={deleting}
            >
              <Glass style={styles.headerDeleteButton} interactive>
                <Text style={styles.headerDeleteText}>Delete</Text>
              </Glass>
            </Pressable>
          </View>
        </View>
        <Text style={styles.title}>{selectedGroup.name}</Text>

        <FlatList
          data={selectedGroup.sessions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshAll}
              tintColor={theme.textDim}
            />
          }
          ListHeaderComponent={
            <View>
              <FadeIn>
                <Pressable onPress={() => openSessionEditor(selectedGroup.id, null)}>
                  <Glass style={styles.newBtn} interactive>
                    <Text style={styles.newBtnText}>+ New workout</Text>
                  </Glass>
                </Pressable>
              </FadeIn>
              {account.splits.loaded &&
                !account.splits.error &&
                selectedGroup.sessions.length === 0 && (
                  <Glass style={styles.notice}>
                    <Text style={styles.noticeText}>This split has no workout days yet.</Text>
                  </Glass>
                )}
            </View>
          }
          renderItem={({ item, index }) => (
            <FadeIn delay={(index + 1) * 45}>
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  onPress={() =>
                    openSessionEditor(
                      item.splitId,
                      item.sessionId,
                      item.kind === 'rest' && item.synthetic ? item.dayNumber : undefined
                    )
                  }
                  style={styles.openRow}
                >
                  <View style={styles.rowCopy}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.dayLabel}>Day {item.dayNumber}</Text>
                      <Text style={styles.nameRowText}>{item.name}</Text>
                    </View>
                    {item.kind === 'workout' && (
                      <Text style={styles.rowMeta}>
                        {item.exercises.length}{' '}
                        {item.exercises.length === 1 ? 'exercise' : 'exercises'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Glass>
            </FadeIn>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
        <DeleteConfirmationModal
          visible={deleteTarget !== null}
          title="Delete split?"
          message={
            deleteTarget
              ? `“${deleteTarget.name}” and all of its workout days will be permanently deleted.`
              : ''
          }
          busy={deleting}
          error={actionError}
          onCancel={() => {
            setDeleteTarget(null);
            setActionError(null);
          }}
          onConfirm={confirmDelete}
        />
      </View>
    );
  }

  const templates = account.workoutTemplates;
  const splits = account.splits;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
          <Glass style={styles.backChip} interactive>
            <Text style={styles.backText}>‹ Home</Text>
          </Glass>
        </Pressable>
      </View>
      <Text style={styles.title}>Workouts and Splits</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={theme.textDim}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <FadeIn>
          <Text style={styles.sectionLabel}>
            Splits{' '}
            <Text style={styles.sectionHint}>
              (a combination of workouts in a repeating schedule)
            </Text>
          </Text>
        </FadeIn>
        <FadeIn delay={30}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new split"
            onPress={() => {
              tick();
              setMode('newSplit');
            }}
          >
            <Glass style={styles.newBtn} interactive>
              <Text style={styles.newBtnText}>+ New split</Text>
            </Glass>
          </Pressable>
        </FadeIn>
        {splits.loading && !splits.loaded && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>Loading your saved splits…</Text>
          </Glass>
        )}
        {splits.error && (
          <Pressable onPress={account.refreshSplits}>
            <Glass style={styles.notice} interactive>
              <Text style={styles.errorText}>Saved splits could not load.</Text>
              <Text style={styles.noticeText}>Tap to retry. Demo plans were not substituted.</Text>
            </Glass>
          </Pressable>
        )}
        {splits.loaded && !splits.error && groups.length === 0 && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>
              No saved splits yet. Create a split and it will appear here.
            </Text>
          </Glass>
        )}
        {groups.map((group, index) => {
          const workoutDays = group.sessions.filter(
            (session: AccountWorkoutEditorEntry) => session.kind === 'workout'
          );
          const isActive = group.id === account.activeSplitId;
          return (
            <FadeIn key={group.id} delay={(index + 2) * 30}>
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${group.name} split`}
                  onPress={() => {
                    tick();
                    setDeleteTarget(null);
                    setActionError(null);
                    setSelectedSplitId(group.id);
                  }}
                  style={styles.openRow}
                >
                  <View style={styles.rowCopy}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.nameRowText}>{group.name}</Text>
                      {isActive && <Text style={styles.activeBadge}>ACTIVE</Text>}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {workoutDays.length} workout{' '}
                      {workoutDays.length === 1 ? 'day' : 'days'}
                      {group.cycleLength ? ` · ${group.cycleLength}-day cycle` : ''}
                      {workoutDays.length > 0
                        ? ` · ${workoutDays.map((session) => session.name).join(' · ')}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Glass>
            </FadeIn>
          );
        })}

        <FadeIn delay={60}>
          <Text style={[styles.sectionLabel, styles.splitsLabel]}>Workouts</Text>
        </FadeIn>
        <FadeIn delay={90}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new workout"
            onPress={() => {
              tick();
              setEditingTemplate(null);
              setMode('templateEditor');
            }}
          >
            <Glass style={styles.newBtn} interactive>
              <Text style={styles.newBtnText}>+ New workout</Text>
            </Glass>
          </Pressable>
        </FadeIn>
        {templates.loading && !templates.loaded && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>Loading your saved workouts…</Text>
          </Glass>
        )}
        {templates.error && (
          <Pressable onPress={account.refreshWorkoutTemplates}>
            <Glass style={styles.notice} interactive>
              <Text style={styles.errorText}>Saved workouts could not load.</Text>
              <Text style={styles.noticeText}>Tap to retry.</Text>
            </Glass>
          </Pressable>
        )}
        {templates.loaded && !templates.error && templates.data.length === 0 && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>
              No saved workouts yet. Create one and it will appear here.
            </Text>
          </Glass>
        )}
        <View style={styles.workoutGrid}>
          {templates.data.map((template: SessionTemplateResponse, index) => (
            <FadeIn key={template.id} style={styles.workoutCell} delay={(index + 4) * 30}>
              <Glass style={styles.workoutCard} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${template.name}`}
                  onPress={() => {
                    tick();
                    setEditingTemplate(template);
                    setMode('templateEditor');
                  }}
                  style={styles.workoutCardPress}
                >
                  <Text style={styles.nameRowText} numberOfLines={1}>
                    {template.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={2}>
                    {template.exercises.length}{' '}
                    {template.exercises.length === 1 ? 'exercise' : 'exercises'}
                    {template.exercises.length > 0
                      ? ` · ${template.exercises
                          .map((exercise) => exercise.exercise_name)
                          .join(' · ')}`
                      : ''}
                  </Text>
                </Pressable>
              </Glass>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  backWrap: {
    alignSelf: 'flex-start',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backChip: {
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  splitsLabel: {
    marginTop: 22,
  },
  sectionHint: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  newBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  newBtnText: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  nameRow: {
    borderRadius: 18,
    paddingVertical: 17,
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  openRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRowText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: theme.textDim,
    fontSize: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDeleteButton: {
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerDeleteText: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '700',
  },
  headerActivateText: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  headerActivateOn: {
    color: theme.accent,
  },
  activeBadge: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  workoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  workoutCell: {
    width: '48.5%',
  },
  workoutCard: {
    borderRadius: 18,
    marginBottom: 10,
  },
  workoutCardPress: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 78,
  },
  notice: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  noticeText: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowCopy: {
    flex: 1,
    marginRight: 12,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayLabel: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  rowMeta: {
    color: theme.textDim,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 5,
  },
});
