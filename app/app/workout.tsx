import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  type ViewToken,
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
  const [error, setError] = useState<string | null>(null);
  const [pagerHeight, setPagerHeight] = useState(0);

  const exercises = activeWorkout?.exercises ?? [];
  const exerciseCount = exercises.length;
  const sessionName = activeWorkout?.sessionName ?? 'Workout';
  const startedAt = activeWorkout?.startedAt ?? new Date().toISOString();
  const dragStartX = useRef(0);
  const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

  // Gate: ignore onViewableItemsChanged until the initial scroll has settled.
  // Without this, the callback fires during FlatList layout before
  // initialScrollIndex takes effect, overwriting the persisted index.
  const hasInitialized = useRef(false);

  // After mount, ensure FlatList is at the persisted index and enable tracking
  useEffect(() => {
    hasInitialized.current = false;
    const target = Math.min(storedIndex, exerciseCount);
    const timer = setTimeout(() => {
      if (flatListRef.current && exerciseCount > 0 && target > 0) {
        flatListRef.current.scrollToIndex({ index: target, animated: false });
      }
      hasInitialized.current = true;
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — store is already hydrated

  // Clamp currentIndex if exercises removed
  useEffect(() => {
    const max = exerciseCount; // summary page
    if (currentIndex > max) setCurrentIndex(max);
  }, [exerciseCount, currentIndex, setCurrentIndex]);

  const handleScrollBeginDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      dragStartX.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const dx = Math.abs(e.nativeEvent.contentOffset.x - dragStartX.current);
      if (dx < SWIPE_THRESHOLD) {
        // Snap back — drag was too short
        const page = Math.round(dragStartX.current / SCREEN_WIDTH);
        flatListRef.current?.scrollToIndex({ index: page, animated: true });
      }
    },
    [],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!hasInitialized.current) return; // skip during initial scroll
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  );

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: { viewAreaCoveragePercentThreshold: 50 },
      onViewableItemsChanged: onViewableItemsChanged.current,
    },
  ]);

  const scrollToIndex = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToIndex({ index, animated: true });
      setCurrentIndex(index);
    },
    [],
  );

  const handleAddExercise = (name: string) => {
    addExercise(name);
    setShowPicker(false);
    // Scroll to the newly added exercise — read store directly to avoid stale closure
    setTimeout(() => {
      const count = useWorkoutStore.getState().activeWorkout?.exercises.length ?? 0;
      scrollToIndex(count - 1);
    }, 100);
  };

  const handleMinimize = () => router.back();

  const handleCancel = () => {
    router.back();
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
          router.back();
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
              onAddExercise={() => setShowPicker(true)}
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
          <TouchableOpacity onPress={() => router.back()}>
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
            snapToInterval={SCREEN_WIDTH}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            bounces={false}
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialScrollIndex={currentIndex}
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
        onClose={() => setShowPicker(false)}
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
