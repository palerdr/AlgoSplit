import React, { useState, useCallback, useEffect, useRef } from 'react';
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

  const handleWebExerciseMove = useCallback((targetId: string) => {
    if (!draggingExerciseId || draggingExerciseId === targetId) return;

    onUpdate({
      ...session,
      exercises: reorderExercises(session.exercises, draggingExerciseId, targetId),
    });
  }, [draggingExerciseId, onUpdate, session]);

  // Refs keep closures up-to-date without re-running the drag effect mid-drag
  const moveRef = useRef(handleWebExerciseMove);
  moveRef.current = handleWebExerciseMove;
  const dragEndRef = useRef(onDragEnd);
  dragEndRef.current = onDragEnd;
  const exDragRef = useRef<{ startY: number; el: HTMLElement | null; initialized: boolean }>({
    startY: 0, el: null, initialized: false,
  });

  useEffect(() => {
    if (!isWeb || !draggingExerciseId || typeof window === 'undefined') return;

    // Acquire the dragged wrapper element and apply "lifted" visual
    const dragEl = document.getElementById(`drag-ex-${draggingExerciseId}`);
    exDragRef.current = { startY: 0, el: dragEl, initialized: false };
    if (dragEl) {
      dragEl.style.zIndex = '999';
      dragEl.style.position = 'relative';
      dragEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
      dragEl.style.opacity = '0.95';
    }

    const stopExerciseDrag = () => {
      const { el } = exDragRef.current;
      if (el) {
        el.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s, opacity 0.15s';
        el.style.transform = '';
        el.style.boxShadow = '';
        el.style.opacity = '';
        setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; el.style.position = ''; }, 160);
      }
      exDragRef.current = { startY: 0, el: null, initialized: false };
      setDraggingExerciseId(null);
      dragEndRef.current?.();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = exDragRef.current;
      // Capture start position on first move
      if (!state.initialized) {
        state.initialized = true;
        state.startY = e.clientY;
      }
      // Translate dragged element to follow pointer
      if (state.el) {
        state.el.style.transition = 'none';
        state.el.style.transform = `translateY(${e.clientY - state.startY}px) scale(1.02)`;
      }

      // Hide dragged el from hit-test so elementFromPoint finds what's underneath
      if (state.el) state.el.style.pointerEvents = 'none';
      const hitEl = document.elementFromPoint(e.clientX, e.clientY);
      if (state.el) state.el.style.pointerEvents = '';

      if (!hitEl) return;
      const wrapper = (hitEl as HTMLElement).closest?.('[id^="drag-ex-"]');
      if (wrapper) {
        const targetId = wrapper.id.replace('drag-ex-', '');
        if (targetId && targetId !== draggingExerciseId) {
          const oldRect = state.el?.getBoundingClientRect();
          moveRef.current(targetId);
          // Recalibrate position after React commits the DOM reorder
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!exDragRef.current.el) return; // drag ended, skip
            const newEl = document.getElementById(`drag-ex-${draggingExerciseId}`);
            if (newEl && oldRect) {
              const newRect = newEl.getBoundingClientRect();
              state.startY += newRect.top - oldRect.top;
              state.el = newEl;
              newEl.style.transition = 'none';
              newEl.style.transform = `translateY(${e.clientY - state.startY}px) scale(1.02)`;
              newEl.style.zIndex = '999';
              newEl.style.position = 'relative';
              newEl.style.opacity = '0.95';
              newEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
            }
          }));
        }
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopExerciseDrag);
    window.addEventListener('mouseup', stopExerciseDrag);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopExerciseDrag);
      window.removeEventListener('mouseup', stopExerciseDrag);
    };
  }, [draggingExerciseId, isWeb]);

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
    <View style={[styles.container, draggingExerciseId && styles.containerDragging]}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        {/* Top row: chevron, day picker, session name, trash */}
        <View style={styles.headerTopRow}>
          {Platform.OS === 'web' ? (
            <View
              style={[styles.sessionDragHandle, { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as any]}
              onPointerDown={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                try { (e.target as HTMLElement).releasePointerCapture(e.nativeEvent.pointerId); } catch {}
                dragSession?.();
              }}
            >
              <Ionicons
                name="reorder-three-outline"
                size={18}
                color={isSessionActive ? colors.green : colors.textSecondary}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.sessionDragHandle}
              onPress={(e) => e.stopPropagation()}
              onLongPress={(e) => {
                e.stopPropagation();
                dragSession?.();
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
          )}
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
                  nativeID={`drag-ex-${exerciseId}`}
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
  containerDragging: {
    overflow: 'visible' as const,
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
    ...Platform.select({ web: { cursor: 'grab', touchAction: 'none' } as any, default: {} }),
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
