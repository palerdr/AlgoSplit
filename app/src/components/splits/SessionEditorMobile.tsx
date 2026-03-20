import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { NestableDraggableFlatList } from 'react-native-draggable-flatlist';
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
  simultaneousHandlers?: React.Ref<any> | React.Ref<any>[];
  dragSession?: () => void;
  isSessionActive?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function reorderExercises(
  previous: ExerciseInput[],
  activeId: string,
  targetId: string,
): ExerciseInput[] {
  const fromIndex = previous.findIndex((exercise) => exercise.id === activeId);
  const toIndex = previous.findIndex((exercise) => exercise.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return previous;
  }

  const reordered = [...previous];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

export default function SessionEditorMobile({
  session,
  onUpdate,
  onRemove,
  canRemove,
  defaultExpanded = true,
  simultaneousHandlers,
  dragSession,
  isSessionActive = false,
  onDragStart,
  onDragEnd,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null);
  const isWeb = Platform.OS === 'web';
  const ExerciseListComponent: any = isWeb ? DraggableFlatList : NestableDraggableFlatList;

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

  useEffect(() => {
    if (!isWeb || !draggingExerciseId || typeof window === 'undefined') return;

    const stopExerciseDrag = () => {
      setDraggingExerciseId(null);
      onDragEnd?.();
    };

    window.addEventListener('pointerup', stopExerciseDrag);
    window.addEventListener('mouseup', stopExerciseDrag);

    return () => {
      window.removeEventListener('pointerup', stopExerciseDrag);
      window.removeEventListener('mouseup', stopExerciseDrag);
    };
  }, [draggingExerciseId, isWeb, onDragEnd, onUpdate, session]);

  const handleWebExerciseMove = useCallback((targetId: string) => {
    if (!draggingExerciseId || draggingExerciseId === targetId) return;

    onUpdate({
      ...session,
      exercises: reorderExercises(session.exercises, draggingExerciseId, targetId),
    });
  }, [draggingExerciseId, onUpdate, session]);

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
        {/* Top row: chevron, day picker, session name, trash */}
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.sessionDragHandle}
            onPress={(e) => e.stopPropagation()}
            onPressIn={(e) => {
              e.stopPropagation();
              if (Platform.OS === 'web') {
                dragSession?.();
              }
            }}
            onLongPress={(e) => {
              e.stopPropagation();
              if (Platform.OS !== 'web') {
                dragSession?.();
              }
            }}
            delayLongPress={180}
            hitSlop={8}
          >
            <Ionicons
              name="reorder-three-outline"
              size={18}
              color={isSessionActive ? colors.green : colors.textSecondary}
            />
          </TouchableOpacity>
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
                onUpdate({ ...session, day: Math.min(7, session.day + 1) });
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
        </View>
        {/* Bottom row: meta summary */}
        <Text style={styles.sessionMeta}>
          {session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''} · {totalSets} sets
        </Text>
      </TouchableOpacity>

      {/* Body */}
      {expanded && (
        <View style={styles.body}>
          {isWeb ? (
            session.exercises.map((item, index) => {
              const exerciseId = item.id ?? `exercise_${index}`;
              return (
                <View
                  key={exerciseId}
                  onPointerMove={() => handleWebExerciseMove(exerciseId)}
                >
                  <ExerciseRowMobile
                    exercise={item}
                    index={index}
                    onUpdate={(ex) => updateExercise(item.id, index, ex)}
                    onRemove={() => removeExercise(item.id, index)}
                    drag={() => {
                      setDraggingExerciseId(exerciseId);
                      onDragStart?.();
                    }}
                    isActive={draggingExerciseId === exerciseId}
                  />
                </View>
              );
            })
          ) : (
            <ExerciseListComponent
              data={session.exercises}
              keyExtractor={(item: ExerciseInput, index: number) => item.id ?? `exercise_${index}`}
              renderItem={({
                item,
                drag,
                isActive,
                getIndex,
              }: {
                item: ExerciseInput;
                drag: () => void;
                isActive: boolean;
                getIndex: () => number | undefined;
              }) => {
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
              onRelease={() => onDragEnd?.()}
              onDragEnd={({ data }: { data: ExerciseInput[] }) => {
                onUpdate({ ...session, exercises: data });
                onDragEnd?.();
              }}
              scrollEnabled={false}
              activationDistance={14}
              autoscrollThreshold={40}
              autoscrollSpeed={150}
              keyboardShouldPersistTaps="handled"
              containerStyle={styles.listContainer}
              simultaneousHandlers={simultaneousHandlers}
            />
          )}
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
    overflow: 'hidden',
  },
  header: {
    padding: spacing.md,
    gap: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  sessionDragHandle: {
    paddingHorizontal: 2,
    paddingVertical: 4,
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
    minWidth: 0, // allow flex shrink past intrinsic width
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
    marginLeft: 24, // align with session name (past chevron)
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
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
