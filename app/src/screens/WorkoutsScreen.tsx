import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccountState } from '../state/AccountState';
import {
  AccountWorkoutEditorEntry,
  AccountWorkoutEditorGroup,
  accountWorkoutEditorGroups,
} from '../workout/splitSessions';
import { workoutsPrimaryCreateTarget } from '../workout/newSplitDraft';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import NewSplitEditor from '../components/workouts/NewSplitEditor';
import WorkoutEditor from '../components/workouts/WorkoutEditor';

interface WorkoutsScreenProps {
  onBack: () => void;
}

type DeleteTarget = { splitId: string; name: string };

export default function WorkoutsScreen({
  onBack,
}: WorkoutsScreenProps) {
  const account = useAccountState();
  const groups = useMemo(
    () => accountWorkoutEditorGroups(account.splits.data),
    [account.splits.data]
  );
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [mode, setMode] = useState<'browse' | 'newSplit' | 'editor'>('browse');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingRestDay, setEditingRestDay] = useState<number | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedGroup = groups.find((group) => group.id === selectedSplitId) ?? null;
  const createTarget = workoutsPrimaryCreateTarget(selectedGroup?.id ?? null);
  const editingSplit = account.splits.data.find((split) => split.id === selectedSplitId) ?? null;
  const editingSession =
    editingSplit?.sessions.find((session) => session.id === editingSessionId) ?? undefined;
  const items: Array<AccountWorkoutEditorGroup | AccountWorkoutEditorEntry> =
    selectedGroup ? selectedGroup.sessions : groups;

  const openEditor = (
    splitId: string,
    sessionId: string | null,
    restDay?: number
  ) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedSplitId(splitId);
    setEditingSessionId(sessionId);
    setEditingRestDay(restDay);
    setMode('editor');
  };

  const refreshSavedSplits = async () => {
    if (account.splits.loading) return;
    Haptics.selectionAsync().catch(() => {});
    await account.refreshSplits();
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
      <NewSplitEditor
        onCancel={() => setMode('browse')}
        onSaved={(saved) => {
          setSelectedSplitId(saved.id);
          setMode('browse');
        }}
      />
    );
  }

  if (mode === 'editor' && editingSplit) {
    return (
      <WorkoutEditor
        key={`${editingSplit.id}:${editingSessionId ?? `new:${editingRestDay ?? 'open'}`}`}
        split={editingSplit}
        session={editingSession}
        initialRestDay={editingRestDay}
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

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => {
            if (selectedGroup) {
              Haptics.selectionAsync().catch(() => {});
              setDeleteTarget(null);
              setActionError(null);
              setSelectedSplitId(null);
            } else {
              onBack();
            }
          }}
          hitSlop={8}
          style={styles.backWrap}
        >
          <Glass style={styles.backChip} interactive>
            <Text style={styles.backText}>
              {selectedGroup ? '‹ Workouts' : '‹ Home'}
            </Text>
          </Glass>
        </Pressable>
        {selectedGroup && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedGroup.name} split`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setActionError(null);
              setDeleteTarget({ splitId: selectedGroup.id, name: selectedGroup.name });
            }}
            disabled={deleting}
          >
            <Glass style={styles.headerDeleteButton} interactive>
              <Text style={styles.headerDeleteText}>Delete</Text>
            </Glass>
          </Pressable>
        )}
      </View>
      <Text style={styles.title}>{selectedGroup?.name ?? 'Workouts'}</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <FadeIn>
              <View style={styles.accountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountLabel}>
                    {selectedGroup ? 'Workout days' : 'Saved splits'}
                  </Text>
                  <Text style={styles.accountEmail}>{account.user?.email}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh saved splits"
                  onPress={refreshSavedSplits}
                  disabled={account.splits.loading}
                  hitSlop={8}
                >
                  <Text style={[styles.refresh, account.splits.loading && styles.refreshing]}>
                    {account.splits.loading ? 'Refreshing…' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>
            </FadeIn>
            {mode === 'browse' && (
              <FadeIn delay={45}>
                <Pressable
                  onPress={() => {
                    if (createTarget === 'workout' && selectedGroup) {
                      openEditor(selectedGroup.id, null);
                    } else {
                      Haptics.selectionAsync().catch(() => {});
                      setMode('newSplit');
                    }
                  }}
                >
                  <Glass style={styles.newBtn} interactive>
                    <Text style={styles.newBtnText}>
                      {createTarget === 'workout' ? '+ New workout' : '+ New split'}
                    </Text>
                  </Glass>
                </Pressable>
              </FadeIn>
            )}
            {account.splits.loading && !account.splits.loaded && (
              <Glass style={styles.newBtn} interactive>
                <Text style={styles.noticeText}>Loading your saved workouts…</Text>
              </Glass>
            )}
            {account.splits.error && (
              <Pressable onPress={account.refreshSplits}>
                <Glass style={styles.notice} interactive>
                  <Text style={styles.errorText}>Saved workouts could not load.</Text>
                  <Text style={styles.noticeText}>Tap to retry. Demo plans were not substituted.</Text>
                </Glass>
              </Pressable>
            )}
            {account.splits.loaded && !account.splits.error && items.length === 0 && (
              <Glass style={styles.notice}>
                <Text style={styles.noticeText}>
                  {selectedGroup
                    ? 'This split has no workout days yet.'
                    : 'No saved splits yet. Create a split and it will appear here.'}
                </Text>
              </Glass>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <FadeIn delay={(index + 1) * 45}>
            {'sessions' in item ? (
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.name} split`}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setDeleteTarget(null);
                    setActionError(null);
                    setSelectedSplitId(item.id);
                  }}
                  style={styles.openRow}
                >
                  <View style={styles.rowCopy}>
                    <Text style={styles.nameRowText}>{item.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.sessions.filter((session) => session.kind === 'workout').length} workout{' '}
                      {item.sessions.filter((session) => session.kind === 'workout').length === 1
                        ? 'day'
                        : 'days'}
                      {item.cycleLength ? ` · ${item.cycleLength}-day cycle` : ''}
                      {item.sessions.filter((session) => session.kind === 'workout').length > 0
                        ? ` · ${item.sessions
                            .filter((session) => session.kind === 'workout')
                            .map((session) => session.name)
                            .join(' · ')}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Glass>
            ) : (
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  onPress={() =>
                    openEditor(
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
            )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  back: {
    color: theme.textDim,
    fontSize: 15,
    marginBottom: 16,
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
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  exerciseLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  exerciseLineBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.09)',
  },
  exerciseName: {
    color: theme.text,
    fontSize: 15,
  },
  sets: {
    color: theme.textDim,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    borderRadius: 17,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  saveText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  nameField: {
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  nameInput: {
    color: theme.text,
    fontSize: 17,
    paddingVertical: 14,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  pickedName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  setsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setsBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setsBtnText: {
    color: theme.text,
    fontSize: 17,
    lineHeight: 19,
  },
  setsValue: {
    color: theme.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 26,
    textAlign: 'center',
  },
  removeX: {
    color: theme.textDim,
    fontSize: 15,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 8,
  },
  catalogRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catalogName: {
    color: theme.text,
    fontSize: 16,
  },
  catalogPlus: {
    color: theme.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  accountLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  accountEmail: {
    color: theme.textDim,
    fontSize: 11,
    marginTop: 3,
  },
  refresh: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  refreshing: {
    color: theme.textDim,
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
  splitName: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
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
