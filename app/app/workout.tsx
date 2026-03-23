import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWorkoutStore } from '../src/stores/workoutStore';
import { useLogWorkout, usePreviousWorkoutData } from '../src/hooks/useWorkouts';
import WorkoutHeaderMobile from '../src/components/workout/WorkoutHeaderMobile';
import ExerciseViewMobile from '../src/components/workout/ExerciseViewMobile';
import ExerciseNavMobile from '../src/components/workout/ExerciseNavMobile';
import WorkoutSummaryMobile from '../src/components/workout/WorkoutSummaryMobile';
import RestTimerMobile from '../src/components/workout/RestTimerMobile';
import ExercisePickerModal from '../src/components/workout/ExercisePickerModal';
import { colors } from '../src/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.75);

export default function WorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const insertExercise = useWorkoutStore((s) => s.insertExercise);
  const cancelWorkout = useWorkoutStore((s) => s.cancelWorkout);
  const getWorkoutData = useWorkoutStore((s) => s.getWorkoutData);
  const storedIndex = useWorkoutStore((s) => s.currentExerciseIndex);
  const setStoredIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const logWorkoutMutation = useLogWorkout();

  // Fetch previous workout data for "last time" shadow values
  const { data: fetchedPrevData } = usePreviousWorkoutData(activeWorkout?.sessionName);

  // Merge fetched previous data into the store if not already set
  const previousData = activeWorkout?.previousData ?? fetchedPrevData ?? undefined;

  const currentIndex = storedIndex;
  const setCurrentIndex = setStoredIndex;
  const [showPicker, setShowPicker] = useState(false);
  const insertAfterIndex = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagerHeight, setPagerHeight] = useState(0);

  const exercises = activeWorkout?.exercises ?? [];
  const exerciseCount = exercises.length;
  const sessionName = activeWorkout?.sessionName ?? 'Workout';
  const startedAt = activeWorkout?.startedAt ?? new Date().toISOString();
  const isRestoringIndex = useRef(false);
  const restoredWorkoutKey = useRef<string | null>(null);

  // Restore persisted page index once per active workout, after pager layout.
  useEffect(() => {
    const workoutKey = activeWorkout?.startedAt;
    if (!workoutKey) {
      restoredWorkoutKey.current = null;
      return;
    }
    if (restoredWorkoutKey.current === workoutKey) return;
    if (exerciseCount === 0 || pagerHeight === 0) return;

    const target = Math.min(useWorkoutStore.getState().currentExerciseIndex, exerciseCount);
    isRestoringIndex.current = true;
    restoredWorkoutKey.current = workoutKey;

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: target, animated: false });
      setCurrentIndex(target);
      setTimeout(() => {
        isRestoringIndex.current = false;
      }, 120);
    });
  }, [activeWorkout?.startedAt, exerciseCount, pagerHeight, setCurrentIndex]);

  // Clamp currentIndex if exercises removed
  useEffect(() => {
    if (exerciseCount === 0) return;
    const max = exerciseCount; // summary page
    if (currentIndex > max) setCurrentIndex(max);
  }, [exerciseCount, currentIndex, setCurrentIndex]);

  // Eagerly sync currentIndex when the user lifts their finger.
  // snapToInterval handles the actual scroll snapping; this is a fallback
  // for the edge case where the finger lands exactly on a snap point and
  // onMomentumScrollEnd never fires (no animation needed → no momentum).
  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      const clampedIndex = Math.max(0, Math.min(exerciseCount, nextIndex));
      setCurrentIndex(clampedIndex);
    },
    [exerciseCount, setCurrentIndex],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isRestoringIndex.current) return;
      const nextIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      const clampedIndex = Math.max(0, Math.min(exerciseCount, nextIndex));
      setCurrentIndex(clampedIndex);
    },
    [exerciseCount, setCurrentIndex],
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToIndex({ index, animated: true });
      setCurrentIndex(index);
    },
    [],
  );

  const handleAddExercise = (name: string) => {
    const afterIdx = insertAfterIndex.current;
    if (afterIdx != null) {
      insertExercise(name, afterIdx);
      insertAfterIndex.current = null;
      setShowPicker(false);
      // Scroll to the newly inserted exercise (afterIdx + 1)
      setTimeout(() => {
        scrollToIndex(afterIdx + 1);
      }, 100);
    } else {
      addExercise(name);
      setShowPicker(false);
      // Scroll to the newly added exercise at end
      setTimeout(() => {
        const count = useWorkoutStore.getState().activeWorkout?.exercises.length ?? 0;
        scrollToIndex(count - 1);
      }, 100);
    }
  };

  const handleMinimize = () => router.dismiss();

  const handleCancel = () => {
    router.dismiss();
    setTimeout(() => cancelWorkout(), 0);
  };

  const handleFinish = () => {
    const data = getWorkoutData();
    if (!data || data.exercises.length === 0) {
      setError('Enter reps for at least one set before finishing');
      return;
    }

    logWorkoutMutation.mutate(
      {
        session_name: data.sessionName,
        completed_at: data.completedAt,
        exercises: data.exercises,
        duration_minutes: data.durationMinutes,
        session_id: data.sessionId,
        split_id: data.splitId,
      },
      {
        onSuccess: () => {
          cancelWorkout();
          router.dismiss();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to save workout');
        },
      },
    );
  };

  // Build pages: one per exercise + summary
  const pageCount = exerciseCount + 1;
  const pageIndexes = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i),
    [pageCount],
  );

  const renderPage = useCallback(({ index }: { item: number; index: number }) => {
    const pageStyle = { width: SCREEN_WIDTH, height: pagerHeight || undefined, paddingBottom: pagerHeight ? pagerHeight * 0.2 : 0 };

    if (index === exerciseCount) {
      return (
        <View style={[styles.pageWrapper, styles.summaryPageWrapper, pageStyle, { paddingBottom: 0 }]}>
          <View style={[styles.card, styles.summaryCard]}>
            <WorkoutSummaryMobile
              sessionName={sessionName}
              startedAt={startedAt}
              exercises={exercises}
            />
          </View>
        </View>
      );
    }

    const exercise = exercises[index];
    if (!exercise) return <View style={{ width: SCREEN_WIDTH }} />;

    return (
      <View style={[styles.pageWrapper, pageStyle]}>
        <View style={styles.card}>
          <ExerciseViewMobile
            exercise={exercise}
            previousExerciseData={previousData?.[exercise.name]}
            onAddAfter={() => { insertAfterIndex.current = index; setShowPicker(true); }}
          />
        </View>
      </View>
    );
  }, [
    exerciseCount,
    exercises,
    pagerHeight,
    previousData,
    sessionName,
    startedAt,
  ]);

  if (!activeWorkout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Active Workout</Text>
          <TouchableOpacity onPress={() => router.dismiss()}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <WorkoutHeaderMobile
        sessionName={activeWorkout.sessionName}
        startedAt={activeWorkout.startedAt}
        onAddExercise={() => setShowPicker(true)}
        onMinimize={handleMinimize}
        onCancel={handleCancel}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {exerciseCount === 0 ? (
        <View style={styles.emptyWorkout}>
          <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyWorkoutText}>No exercises added yet</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => setShowPicker(true)}>
            <Ionicons name="add" size={18} color="#111" />
            <Text style={styles.addFirstText}>Add First Exercise</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            ref={flatListRef}
            data={pageIndexes}
            renderItem={renderPage}
            keyExtractor={(item) => String(item)}
            horizontal
            pagingEnabled
            bounces={false}
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            removeClippedSubviews
            style={styles.pager}
            onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
            keyboardShouldPersistTaps="handled"
          />

          <ExerciseNavMobile
            currentIndex={currentIndex}
            totalExercises={exerciseCount}
            isSaving={logWorkoutMutation.isPending}
            onPrev={() => scrollToIndex(Math.max(0, currentIndex - 1))}
            onNext={() => scrollToIndex(Math.min(exerciseCount, currentIndex + 1))}
            onFinish={handleFinish}
            onJump={scrollToIndex}
          />
        </>
      )}

      <RestTimerMobile />

      <ExercisePickerModal
        visible={showPicker}
        onSelect={handleAddExercise}
        onClose={() => { setShowPicker(false); insertAfterIndex.current = null; }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pager: {
    flex: 1,
  },
  pageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  summaryPageWrapper: {
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: CARD_MAX_HEIGHT,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryCard: {
    flex: 1,
    maxHeight: '100%',
    paddingBottom: 0,
    alignSelf: 'stretch',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  goBackText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyWorkout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyWorkoutText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.green,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
  },
  addFirstText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    flex: 1,
  },
  errorDismiss: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
});
