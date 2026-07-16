import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SessionResponse, SplitResponse } from '../../api/backend';
import { EXERCISES, type Exercise } from '../../data/exercises';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import Glass from '../../ui/Glass';
import {
  WorkoutDraft,
  WorkoutDraftExercise,
  newWorkoutDraft,
  splitWithWorkoutDraft,
  workoutDraftError,
  workoutDraftFromSession,
} from '../../workout/splitEditing';

interface WorkoutEditorProps {
  split: SplitResponse;
  session?: SessionResponse;
  onCancel: () => void;
  onSaved: (split: SplitResponse) => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

export default function WorkoutEditor({
  split,
  session,
  onCancel,
  onSaved,
}: WorkoutEditorProps) {
  const account = useAccountState();
  const nextKey = useRef(0);
  const [draft, setDraft] = useState<WorkoutDraft>(() =>
    session ? workoutDraftFromSession(split.id, session) : newWorkoutDraft(split)
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return EXERCISES;
    return EXERCISES.filter((exercise) => exercise.name.toLocaleLowerCase().includes(query));
  }, [search]);

  const updateExercise = (index: number, update: Partial<WorkoutDraftExercise>) => {
    setDraft((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, ...update } : exercise
      ),
    }));
  };

  const addExercise = (exercise: Exercise) => {
    tick();
    nextKey.current += 1;
    setDraft((previous) => ({
      ...previous,
      exercises: [
        ...previous.exercises,
        {
          key: `new:${exercise.id}:${nextKey.current}`,
          name: exercise.name,
          sets: 3,
          unilateral: exercise.unilateral,
          resistanceProfile: exercise.resistanceProfile,
        },
      ],
    }));
  };

  const moveExercise = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.exercises.length) return;
    tick();
    setDraft((previous) => {
      const exercises = [...previous.exercises];
      [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
      return { ...previous, exercises };
    });
  };

  const save = async () => {
    const validation = workoutDraftError(split, draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await account.replaceSplit(split.id, splitWithWorkoutDraft(split, draft));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workout could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onCancel} hitSlop={12}>
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

      <Text style={styles.title}>{session ? 'Edit Workout' : 'New Workout'}</Text>
      <Text style={styles.splitName}>{split.name}</Text>

      <FlatList
        data={catalog}
        keyExtractor={(exercise) => exercise.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.fieldRow}>
              <Glass style={styles.nameField}>
                <TextInput
                  accessibilityLabel="Workout name"
                  value={draft.name}
                  onChangeText={(name) => setDraft((previous) => ({ ...previous, name }))}
                  placeholder="Workout name"
                  placeholderTextColor={theme.textDim}
                  style={styles.input}
                />
              </Glass>
              <Glass style={styles.dayField}>
                <Text style={styles.dayPrefix}>Day</Text>
                <TextInput
                  accessibilityLabel="Workout day"
                  value={String(draft.dayNumber)}
                  onChangeText={(value) =>
                    setDraft((previous) => ({
                      ...previous,
                      dayNumber: value === '' ? 0 : Number(value.replace(/\D/g, '').slice(0, 1)),
                    }))
                  }
                  keyboardType="number-pad"
                  style={styles.dayInput}
                />
              </Glass>
            </View>

            <Text style={styles.sectionLabel}>Exercises</Text>
            {draft.exercises.map((exercise, index) => (
              <View key={exercise.key} style={styles.pickedRow}>
                <View style={styles.orderControls}>
                  <Pressable
                    onPress={() => moveExercise(index, -1)}
                    disabled={index === 0}
                    hitSlop={6}
                  >
                    <Text style={[styles.orderText, index === 0 && styles.disabled]}>↑</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveExercise(index, 1)}
                    disabled={index === draft.exercises.length - 1}
                    hitSlop={6}
                  >
                    <Text
                      style={[
                        styles.orderText,
                        index === draft.exercises.length - 1 && styles.disabled,
                      ]}
                    >
                      ↓
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.pickedName} numberOfLines={1}>
                  {exercise.name}
                </Text>
                <View style={styles.setControls}>
                  <Pressable
                    onPress={() => {
                      tick();
                      updateExercise(index, { sets: Math.max(1, exercise.sets - 1) });
                    }}
                    hitSlop={7}
                  >
                    <Text style={styles.setButton}>−</Text>
                  </Pressable>
                  <Text style={styles.setValue}>{exercise.sets}×</Text>
                  <Pressable
                    onPress={() => {
                      tick();
                      updateExercise(index, { sets: Math.min(20, exercise.sets + 1) });
                    }}
                    hitSlop={7}
                  >
                    <Text style={styles.setButton}>+</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => {
                    tick();
                    setDraft((previous) => ({
                      ...previous,
                      exercises: previous.exercises.filter((_, itemIndex) => itemIndex !== index),
                    }));
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            ))}

            <Text style={styles.sectionLabel}>Add exercises</Text>
            <Glass style={styles.searchField}>
              <TextInput
                accessibilityLabel="Search exercises"
                value={search}
                onChangeText={setSearch}
                placeholder="Search exercises"
                placeholderTextColor={theme.textDim}
                autoCorrect={false}
                style={styles.input}
              />
            </Glass>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.catalogRow} onPress={() => addExercise(item)}>
            <Text style={styles.catalogName}>{item.name}</Text>
            <Text style={styles.catalogAdd}>+</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.listContent}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cancel: { color: theme.textDim, fontSize: 14 },
  saveButton: { borderRadius: 17, paddingVertical: 9, paddingHorizontal: 18 },
  saveText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  splitName: { color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 5, marginBottom: 20 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  fieldRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  nameField: { flex: 1, borderRadius: 16, paddingHorizontal: 14 },
  dayField: {
    width: 88,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayPrefix: { color: theme.textDim, fontSize: 12, marginRight: 6 },
  dayInput: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1, paddingVertical: 14 },
  input: { color: theme.text, fontSize: 15, paddingVertical: 14 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 9,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
    gap: 10,
  },
  orderControls: { gap: 1 },
  orderText: { color: theme.textDim, fontSize: 13, lineHeight: 16 },
  pickedName: { color: theme.text, fontSize: 14, flex: 1 },
  setControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  setButton: { color: theme.text, fontSize: 18, width: 18, textAlign: 'center' },
  setValue: { color: theme.text, fontSize: 13, minWidth: 26, textAlign: 'center' },
  remove: { color: theme.textDim, fontSize: 14 },
  searchField: { borderRadius: 16, paddingHorizontal: 14, marginBottom: 8 },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  catalogName: { color: theme.text, fontSize: 15 },
  catalogAdd: { color: theme.accent, fontSize: 20, fontWeight: '600' },
  listContent: { paddingBottom: 40 },
});
