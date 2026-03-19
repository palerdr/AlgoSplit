import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { colors, borders, spacing } from '../../theme';
import ExerciseRowMobile from './ExerciseRowMobile';
import { generateExerciseId } from '../../utils/splitEditHelpers';
import type { SessionInput, ExerciseInput } from '../../types/api.types';

interface Props {
  session: SessionInput;
  onUpdate: (session: SessionInput) => void;
  onRemove: () => void;
  canRemove: boolean;
  defaultExpanded?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function SessionEditorMobile({
  session,
  onUpdate,
  onRemove,
  canRemove,
  defaultExpanded = true,
  onDragStart,
  onDragEnd,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (session.exercises.some((exercise) => !exercise.id)) {
      onUpdate({
        ...session,
        exercises: session.exercises.map((exercise) =>
          exercise.id ? exercise : { ...exercise, id: generateExerciseId() }
        ),
      });
    }
  }, [session, onUpdate]);

  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets, 0);

  const updateExercise = useCallback(
    (exerciseId: string | undefined, fallbackIndex: number, ex: ExerciseInput) => {
      const exercises = [...session.exercises];
      const index = exerciseId
        ? exercises.findIndex((item) => item.id === exerciseId)
        : fallbackIndex;
      if (index < 0 || index >= exercises.length) return;
      exercises[index] = { ...ex, id: exercises[index].id };
      onUpdate({ ...session, exercises });
    },
    [session, onUpdate],
  );

  const removeExercise = useCallback(
    (exerciseId: string | undefined, fallbackIndex: number) => {
      const exercises = exerciseId
        ? session.exercises.filter((exercise) => exercise.id !== exerciseId)
        : session.exercises.filter((_, index) => index !== fallbackIndex);
      onUpdate({ ...session, exercises });
    },
    [session, onUpdate],
  );

  const addExercise = useCallback(() => {
    onUpdate({
      ...session,
      exercises: [...session.exercises, { id: generateExerciseId(), name: '', sets: 3 }],
    });
  }, [session, onUpdate]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
        />
        <View style={styles.dayPicker}>
          <Text style={styles.dayLabel}>Day</Text>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onUpdate({ ...session, day: Math.max(1, session.day - 1) });
            }}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dayValue}>{session.day}</Text>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onUpdate({ ...session, day: session.day + 1 });
            }}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.sessionNameInput}
          placeholder="Session name"
          placeholderTextColor={colors.textMuted}
          value={session.name}
          onChangeText={(name) => onUpdate({ ...session, name })}
          onTouchStart={(e) => e.stopPropagation()}
        />
        <Text style={styles.sessionMeta}>
          {session.exercises.length} ex | {totalSets} sets
        </Text>
        {canRemove && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={16} color={colors.red} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Body */}
      {expanded && (
        <View style={styles.body}>
          <DraggableFlatList
            data={session.exercises}
            keyExtractor={(item, index) => item.id ?? `exercise_${index}`}
            renderItem={({ item, drag, isActive, getIndex }) => {
              const index = getIndex() ?? 0;
              return (
                <ExerciseRowMobile
                  exercise={item}
                  index={index}
                  onUpdate={(ex) => updateExercise(item.id, index, ex)}
                  onRemove={() => removeExercise(item.id, index)}
                  drag={drag}
                  isActive={isActive}
                />
              );
            }}
            onDragBegin={() => onDragStart?.()}
            onDragEnd={({ data }) => {
              onUpdate({ ...session, exercises: data });
              onDragEnd?.();
            }}
            scrollEnabled={false}
            activationDistance={10}
            autoscrollThreshold={40}
            autoscrollSpeed={150}
            keyboardShouldPersistTaps="handled"
            containerStyle={styles.listContainer}
          />
          <TouchableOpacity style={styles.addExerciseBtn} onPress={addExercise}>
            <Ionicons name="add" size={16} color={colors.green} />
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: 8,
  },
  dayPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dayLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  dayValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 16,
    textAlign: 'center',
  },
  sessionNameInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 2,
  },
  sessionMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    overflow: 'visible' as const,
  },
  listContainer: {
    overflow: 'visible',
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addExerciseText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '600',
  },
});
