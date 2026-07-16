import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import type { SessionResponse, SplitResponse } from '../../api/backend';
import { EXERCISES, type Exercise } from '../../data/exercises';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import Glass from '../../ui/Glass';
import {
  WorkoutDraft,
  WorkoutDraftExercise,
  newWorkoutDraft,
  parseWorkoutDayInput,
  reorderWorkoutDraftExercises,
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
const RESISTANCE_PROFILES = [
  { value: 'ascending', label: 'Asc' },
  { value: 'mid', label: 'Mid' },
  { value: 'descending', label: 'Desc' },
] as const;

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
  const [dayText, setDayText] = useState(() => String(draft.dayNumber));
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
          resistanceProfile: 'mid',
        },
      ],
    }));
  };

  const renderPickedExercise = ({
    item: exercise,
    getIndex,
    drag,
    isActive,
  }: RenderItemParams<WorkoutDraftExercise>) => {
    const index = getIndex();
    if (index === undefined) return null;
    return (
      <ScaleDecorator activeScale={1.02}>
        <View style={[styles.pickedRow, isActive && styles.pickedRowActive]}>
          <View style={styles.pickedMainRow}>
            <Pressable
              accessibilityLabel={`Reorder ${exercise.name}`}
              onLongPress={drag}
              delayLongPress={160}
              hitSlop={8}
              style={styles.dragHandle}
            >
              <Text style={[styles.dragHandleText, isActive && styles.dragHandleActive]}>≡</Text>
            </Pressable>
            <Text style={styles.pickedName} numberOfLines={1}>
              {exercise.name}
            </Text>
            <View style={styles.profileOptions}>
              {RESISTANCE_PROFILES.map((profile) => {
                const active = exercise.resistanceProfile === profile.value;
                return (
                  <Pressable
                    key={profile.value}
                    accessibilityRole="button"
                    accessibilityLabel={`${profile.label} resistance profile`}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      tick();
                      updateExercise(index, { resistanceProfile: profile.value });
                    }}
                    style={[styles.profilePill, active && styles.profilePillActive]}
                  >
                    <Text style={[styles.profileText, active && styles.profileTextActive]}>
                      {profile.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
                  exercises: previous.exercises.filter(
                    (candidate) => candidate.key !== exercise.key
                  ),
                }));
              }}
              hitSlop={8}
            >
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        </View>
      </ScaleDecorator>
    );
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

      <NestableScrollContainer
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
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
              value={dayText}
              onChangeText={(value) => {
                const parsed = parseWorkoutDayInput(value);
                setDayText(parsed.text);
                setDraft((previous) => ({
                  ...previous,
                  dayNumber: parsed.dayNumber,
                }));
              }}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              style={styles.dayInput}
            />
          </Glass>
        </View>

        <Text style={styles.sectionLabel}>Exercises</Text>
        <NestableDraggableFlatList
          data={draft.exercises}
          keyExtractor={(exercise) => exercise.key}
          renderItem={renderPickedExercise}
          onDragEnd={({ from, to }) => {
            if (from === to) return;
            tick();
            setDraft((previous) => ({
              ...previous,
              exercises: reorderWorkoutDraftExercises(previous.exercises, from, to),
            }));
          }}
          activationDistance={8}
          scrollEnabled={false}
        />

        <Text style={[styles.sectionLabel, styles.addLabel]}>Add exercises</Text>
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
        {catalog.map((item) => (
          <Pressable key={item.id} style={styles.catalogRow} onPress={() => addExercise(item)}>
            <Text style={styles.catalogName}>{item.name}</Text>
            <Text style={styles.catalogAdd}>+</Text>
          </Pressable>
        ))}
      </NestableScrollContainer>
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
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
  },
  pickedMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickedRowActive: {
    backgroundColor: 'rgba(65,196,110,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.55)',
  },
  dragHandle: { paddingHorizontal: 2, paddingVertical: 7 },
  dragHandleText: { color: theme.textDim, fontSize: 22, lineHeight: 17, fontWeight: '700' },
  dragHandleActive: { color: theme.accent },
  pickedName: { color: theme.text, fontSize: 14, flex: 1 },
  setControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  setButton: { color: theme.text, fontSize: 18, width: 18, textAlign: 'center' },
  setValue: { color: theme.text, fontSize: 13, minWidth: 26, textAlign: 'center' },
  remove: { color: theme.textDim, fontSize: 14 },
  profileOptions: { flexDirection: 'row', gap: 3 },
  profilePill: {
    minWidth: 32,
    alignItems: 'center',
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  profilePillActive: { backgroundColor: 'rgba(65,196,110,0.18)' },
  profileText: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  profileTextActive: { color: theme.accent },
  searchField: { borderRadius: 16, paddingHorizontal: 14, marginBottom: 8 },
  addLabel: { marginTop: 12 },
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
