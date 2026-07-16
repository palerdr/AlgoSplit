import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SplitResponse } from '../../api/backend';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import FadeIn from '../../ui/FadeIn';
import Glass from '../../ui/Glass';
import {
  createNewSplitDraft,
  newSplitDraftError,
  newSplitDraftToCreate,
  newSplitDraftToEditorSplit,
  removeNewSplitDraftSession,
  upsertNewSplitDraftSession,
} from '../../workout/newSplitDraft';
import WorkoutEditor from './WorkoutEditor';

interface NewSplitEditorProps {
  onCancel: () => void;
  onSaved: (split: SplitResponse) => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

export default function NewSplitEditor({ onCancel, onSaved }: NewSplitEditorProps) {
  const account = useAccountState();
  const nextSessionKey = useRef(0);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => createNewSplitDraft(account.analysisPreferences));
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [workoutEditorOpen, setWorkoutEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorSplit = useMemo(() => newSplitDraftToEditorSplit(draft), [draft]);
  const editingSession = editingSessionId
    ? editorSplit.sessions.find((session) => session.id === editingSessionId)
    : undefined;

  if (workoutEditorOpen) {
    return (
      <WorkoutEditor
        key={`new-split:${editingSessionId ?? 'new'}`}
        split={editorSplit}
        session={editingSession}
        onCancel={() => {
          setEditingSessionId(null);
          setWorkoutEditorOpen(false);
        }}
        onDraftSaved={(sessionId, session) => {
          nextSessionKey.current += 1;
          setDraft((previous) =>
            upsertNewSplitDraftSession(
              previous,
              sessionId,
              session,
              `draft-session-${nextSessionKey.current}`
            )
          );
          setError(null);
          setEditingSessionId(null);
          setWorkoutEditorOpen(false);
        }}
      />
    );
  }

  const save = async () => {
    if (savingRef.current) return;
    const validation = newSplitDraftError(draft);
    if (validation) {
      setError(validation);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await account.createSplit(newSplitDraftToCreate(draft));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Split could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const addWorkout = () => {
    if (draft.sessions.length >= 7) {
      setError('A seven-day split cannot contain more than seven workout or rest days.');
      return;
    }
    tick();
    setError(null);
    setEditingSessionId(null);
    setWorkoutEditorOpen(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onCancel} hitSlop={12} disabled={saving}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving}>
          <Glass style={styles.saveButton} interactive>
            <Text style={[styles.saveText, saving && styles.disabled]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Glass>
        </Pressable>
      </View>

      <Text style={styles.title}>New Split</Text>
      <Text style={styles.subtitle}>7-day cycle</Text>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.sectionLabel}>Split name</Text>
        <Glass style={styles.nameField}>
          <TextInput
            accessibilityLabel="Split name"
            value={draft.name}
            onChangeText={(name) => {
              setDraft((previous) => ({ ...previous, name }));
              setError(null);
            }}
            placeholder="Split name"
            placeholderTextColor={theme.textDim}
            maxLength={200}
            autoFocus
            style={styles.input}
          />
        </Glass>

        <Text style={[styles.sectionLabel, styles.workoutLabel]}>Workouts</Text>
        <Pressable onPress={addWorkout} disabled={saving}>
          <Glass style={styles.newButton} interactive>
            <Text style={styles.newButtonText}>+ New workout</Text>
          </Glass>
        </Pressable>

        {draft.sessions.length === 0 && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>
              Add the workout days that belong to this split, then save them together.
            </Text>
          </Glass>
        )}

        {draft.sessions.map(({ id, session }, index) => (
          <FadeIn key={id} delay={(index + 1) * 45}>
            <Glass style={styles.workoutRow} interactive>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${session.name}`}
                onPress={() => {
                  tick();
                  setEditingSessionId(id);
                  setWorkoutEditorOpen(true);
                }}
                style={styles.workoutMain}
              >
                <View style={styles.workoutCopy}>
                  <View style={styles.workoutTitleLine}>
                    <Text style={styles.dayLabel}>Day {session.day_number}</Text>
                    <Text style={styles.workoutName} numberOfLines={1}>
                      {session.name}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {session.exercises.length === 0
                      ? 'Rest'
                      : `${session.exercises.length} ${
                          session.exercises.length === 1 ? 'exercise' : 'exercises'
                        }`}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${session.name}`}
                onPress={() => {
                  tick();
                  setDraft((previous) => removeNewSplitDraftSession(previous, id));
                  setError(null);
                }}
                hitSlop={8}
                style={styles.removeWrap}
              >
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </Glass>
          </FadeIn>
        ))}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cancel: { color: theme.textDim, fontSize: 14 },
  saveButton: { borderRadius: 17, paddingVertical: 9, paddingHorizontal: 18 },
  saveText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  subtitle: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
    marginBottom: 20,
  },
  content: { paddingBottom: 40 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 9,
  },
  workoutLabel: { marginTop: 20 },
  nameField: { borderRadius: 16, paddingHorizontal: 14 },
  input: { color: theme.text, fontSize: 15, paddingVertical: 14 },
  newButton: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  newButtonText: { color: theme.accent, fontSize: 16, fontWeight: '700' },
  notice: { borderRadius: 18, padding: 16, marginBottom: 14 },
  noticeText: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
  workoutRow: {
    borderRadius: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutMain: {
    flex: 1,
    paddingVertical: 17,
    paddingLeft: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutCopy: { flex: 1, marginRight: 12 },
  workoutTitleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  dayLabel: { color: theme.accent, fontSize: 12, fontWeight: '800' },
  workoutName: { color: theme.text, fontSize: 16, fontWeight: '600', flex: 1 },
  meta: { color: theme.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  chevron: { color: theme.textDim, fontSize: 20 },
  removeWrap: { paddingVertical: 20, paddingHorizontal: 17 },
  remove: { color: theme.textDim, fontSize: 13 },
});
