import { memo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SetRowMobile from './SetRowMobile';
import WorkoutActionSheet from './WorkoutActionSheet';
import ExercisePickerModal from './ExercisePickerModal';
import { useWorkoutStore, type WorkoutExercise } from '../../stores/workoutStore';
import { colors } from '../../theme';

interface ExerciseViewMobileProps {
  exercise: WorkoutExercise;
  previousExerciseData?: { reps: number[]; weight: number[]; rir?: (number | null)[] };
  onAddAfter?: () => void;
}

function ExerciseViewMobile({ exercise, previousExerciseData, onAddAfter }: ExerciseViewMobileProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Notes uses defaultValue (uncontrolled) so an in-flight keystroke can't be
  // clobbered when an action like Add Set causes a re-render before the latest
  // onChangeText has committed to the store. The native input owns its text;
  // onChangeText still mirrors it to the store. The ref lets us force-sync
  // when the underlying exercise changes (e.g. swap) since defaultValue alone
  // would be ignored after mount.
  const notesRef = useRef<TextInput>(null);
  const lastSyncedNotes = useRef<string>(exercise.notes);
  if (lastSyncedNotes.current !== exercise.notes) {
    lastSyncedNotes.current = exercise.notes;
    notesRef.current?.setNativeProps({ text: exercise.notes });
  }
  const addSet = useWorkoutStore((s) => s.addSet);
  const removeSet = useWorkoutStore((s) => s.removeSet);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const completeSet = useWorkoutStore((s) => s.completeSet);
  const updateExerciseNotes = useWorkoutStore((s) => s.updateExerciseNotes);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const resetExerciseProgress = useWorkoutStore((s) => s.resetExerciseProgress);
  const renameExercise = useWorkoutStore((s) => s.renameExercise);

  const isUni = exercise.unilateral ?? false;
  const totalSets = exercise.sets.length;
  const logicalSets = isUni ? Math.floor(totalSets / 2) : totalSets;
  const completedSets = exercise.sets.filter((s) => s.completed).length;
  const logicalCompleted = isUni ? Math.floor(completedSets / 2) : completedSets;

  const getPrev = (pairIndex: number) =>
    previousExerciseData && previousExerciseData.reps[pairIndex] != null
      ? { reps: previousExerciseData.reps[pairIndex], weight: previousExerciseData.weight[pairIndex], rir: previousExerciseData.rir?.[pairIndex] }
      : undefined;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.setCount}>{logicalCompleted}/{logicalSets} sets completed</Text>
        </View>
        <TouchableOpacity onPress={() => setShowMenu((v) => !v)} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {/* Column headers — cell Views match SetRowMobile layout exactly */}
        <View style={styles.colHeaders}>
          <View style={{ width: 28 }}><Text style={styles.colLabel}>Set</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.colLabel}>Weight</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.colLabel}>Reps</Text></View>
          <View style={{ flex: 0.6 }}><Text style={styles.colLabel}>RIR</Text></View>
          <View style={{ width: 34 }} />
          <View style={{ width: 28 }} />
        </View>

        {/* Set rows */}
        {isUni
          ? Array.from({ length: logicalSets }).map((_, pairIdx) => {
              const lIdx = pairIdx * 2;
              const rIdx = pairIdx * 2 + 1;
              const lSet = exercise.sets[lIdx];
              const rSet = exercise.sets[rIdx];
              if (!lSet || !rSet) return null;
              return (
                <View key={pairIdx}>
                  <SetRowMobile
                    setIndex={pairIdx}
                    data={lSet}
                    sideLabel="L"
                    previousSet={getPrev(pairIdx)}
                    onUpdate={(d) => updateSet(exercise.id, lIdx, d)}
                    onComplete={() => completeSet(exercise.id, lIdx)}
                    onRemove={() => removeSet(exercise.id, lIdx)}
                    canRemove={logicalSets > 1}
                  />
                  <SetRowMobile
                    setIndex={pairIdx}
                    data={rSet}
                    sideLabel="R"
                    previousSet={getPrev(pairIdx)}
                    onUpdate={(d) => updateSet(exercise.id, rIdx, d)}
                    onComplete={() => completeSet(exercise.id, rIdx)}
                    onRemove={() => removeSet(exercise.id, rIdx)}
                    canRemove={false}
                  />
                </View>
              );
            })
          : exercise.sets.map((set, idx) => (
              <SetRowMobile
                key={idx}
                setIndex={idx}
                data={set}
                previousSet={getPrev(idx)}
                onUpdate={(d) => updateSet(exercise.id, idx, d)}
                onComplete={() => completeSet(exercise.id, idx)}
                onRemove={() => removeSet(exercise.id, idx)}
                canRemove={exercise.sets.length > 1}
              />
            ))}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => addSet(exercise.id)}>
            <Ionicons name="add" size={16} color={colors.textSecondary} />
            <Text style={styles.actionText}>Add Set</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          ref={notesRef}
          style={styles.notesInput}
          defaultValue={exercise.notes}
          onChangeText={(t) => {
            lastSyncedNotes.current = t;
            updateExerciseNotes(exercise.id, t);
          }}
          placeholder="Add notes..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
      </ScrollView>

      {confirmReset && (
        <>
          <Pressable style={styles.confirmOverlay} onPress={() => setConfirmReset(false)} />
          <View style={styles.confirmDropdown}>
            <Text style={styles.confirmText}>Reset all progress?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmReset(false)}>
                <Text style={styles.confirmNo}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => { resetExerciseProgress(exercise.id); setConfirmReset(false); }}>
                <Text style={styles.confirmYes}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <WorkoutActionSheet
        visible={showMenu}
        onAddAfter={onAddAfter ? () => { setShowMenu(false); onAddAfter(); } : undefined}
        onReset={() => { setShowMenu(false); setConfirmReset(true); }}
        onSwap={() => { setShowMenu(false); setShowSwapPicker(true); }}
        onDelete={() => { removeExercise(exercise.id); setShowMenu(false); }}
        onClose={() => setShowMenu(false)}
      />

      <ExercisePickerModal
        visible={showSwapPicker}
        onSelect={(name) => { renameExercise(exercise.id, name); setShowSwapPicker(false); }}
        onClose={() => setShowSwapPicker(false)}
      />
    </View>
  );
}

export default memo(ExerciseViewMobile);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 4,
  },
  scrollContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  setCount: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  colLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  actionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    fontSize: 16, // >=16 prevents iOS Safari auto-zoom on focus
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  confirmOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  confirmDropdown: {
    position: 'absolute',
    top: 52,
    right: 4,
    zIndex: 11,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  confirmBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  confirmBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  confirmNo: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmYes: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '700',
  },
});
