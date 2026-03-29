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

  // Wait for Zustand to hydrate from AsyncStorage before reading any state.
  // On Safari, switching tabs evicts the page — the full app reloads and
  // the store starts with defaults (index 0, activeWorkout null) until
  // AsyncStorage hydration completes. Without this gate, refs and the
  // FlatList capture stale default values.
  const [hydrated, setHydrated] = useState(useWorkoutStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useWorkoutStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

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

  // Persist fetched previous data into the workout store so it survives
  // tab switches without waiting for a fresh query re-fetch.
  useEffect(() => {
    if (!fetchedPrevData || !activeWorkout || activeWorkout.previousData) return;
    useWorkoutStore.setState((s) => {
      if (!s.activeWorkout || s.activeWorkout.previousData) return s;
      return { activeWorkout: { ...s.activeWorkout, previousData: fetchedPrevData } };
    });
  }, [fetchedPrevData, activeWorkout?.startedAt]);

  const previousData = activeWorkout?.previousData ?? fetchedPrevData ?? undefined;

  const currentIndex = storedIndex;
  const setCurrentIndex = setStoredIndex;
  const [showPicker, setShowPicker] = useState(false);
  const insertAfterIndex = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(SCREEN_WIDTH);
  const isDismissing = useRef(false);

  const exercises = activeWorkout?.exercises ?? [];
  const exerciseCount = exercises.length;
  const sessionName = activeWorkout?.sessionName ?? 'Workout';
  const startedAt = activeWorkout?.startedAt ?? new Date().toISOString();

  // Block scroll handlers until we've imperatively restored the scroll position.
  // Without this, scroll events during mount/layout overwrite the persisted index.
  const isRestoringIndex = useRef(true);
  const hasRestoredScroll = useRef(false);
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // After hydration + layout, imperatively scroll to the persisted index.
  // We read the index HERE (not in a ref at mount time) because on a full
  // page reload the store hasn't hydrated yet when the ref initializes.
  useEffect(() => {
    if (!hydrated) return;
    if (!activeWorkout) {
      isRestoringIndex.current = false;
      return;
    }
    if (exerciseCount === 0 || pagerHeight === 0) return; // Wait for layout
    if (hasRestoredScroll.current) return; // Only restore once per mount

    // Read the index NOW — after hydration, this is the real persisted value
    const storedIdx = useWorkoutStore.getState().currentExerciseIndex;
    const target = Math.max(0, Math.min(exerciseCount, storedIdx));
    hasRestoredScroll.current = true;

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: target, animated: false });
      setCurrentIndex(target);
      setTimeout(() => {
        isRestoringIndex.current = false;
      }, 200);
    });
  }, [hydrated, activeWorkout, exerciseCount, pagerHeight, setCurrentIndex]);

  // Clamp currentIndex if exercises removed
  useEffect(() => {
    if (exerciseCount === 0) return;
    const max = exerciseCount; // summary page
    if (currentIndex > max) setCurrentIndex(max);
  }, [exerciseCount, currentIndex, setCurrentIndex]);

  // Debounced scroll handler: fires on every scroll frame, but only commits
  // the index once scrolling settles (no new events for 80ms). This is the
  // fallback for cases where onMomentumScrollEnd doesn't fire (known RN
  // issue with pagingEnabled when the finger lifts exactly on a snap point).
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isRestoringIndex.current) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = setTimeout(() => {
        const nextIndex = Math.round(offsetX / pagerWidth);
        const clampedIndex = Math.max(0, Math.min(exerciseCount, nextIndex));
        setCurrentIndex(clampedIndex);
      }, 80);
    },
    [exerciseCount, pagerWidth, setCurrentIndex],
  );

  // Fast path: fires immediately after the page snap animation finishes,
  // cancels the debounce timer so we don't double-update.
  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      if (isRestoringIndex.current) return;
      const nextIndex = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
      const clampedIndex = Math.max(0, Math.min(exerciseCount, nextIndex));
      setCurrentIndex(clampedIndex);
    },
    [exerciseCount, pagerWidth, setCurrentIndex],
  );

  // Fallback if initialScrollIndex can't reach the target (e.g. items not yet rendered)
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const targetIndex = Math.max(0, Math.min(exerciseCount, info.index));
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: targetIndex * pagerWidth, animated: false });
        setCurrentIndex(targetIndex);
      });
    },
    [exerciseCount, pagerWidth, setCurrentIndex],
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

  const safeDismiss = useCallback(() => {
    isDismissing.current = true;
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.back();
    }
  }, [router]);

  const handleMinimize = () => safeDismiss();

  const handleCancel = () => {
    safeDismiss();
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
          safeDismiss();
          setTimeout(() => cancelWorkout(), 0);
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
    const pageStyle = { width: pagerWidth, height: pagerHeight || undefined, paddingBottom: pagerHeight ? pagerHeight * 0.2 : 0 };

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
    if (!exercise) return <View style={{ width: pagerWidth }} />;

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
    pagerWidth,
    previousData,
    sessionName,
    startedAt,
  ]);

  if (!hydrated || !activeWorkout) {
    // If we're mid-dismiss, render nothing — the modal is already closing.
    if (isDismissing.current) return null;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyContainer}>
          {hydrated ? (
            <>
              <Text style={styles.emptyTitle}>No Active Workout</Text>
              <TouchableOpacity onPress={() => safeDismiss()}>
                <Text style={styles.goBackText}>Go Back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.emptyTitle}>Loading...</Text>
          )}
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
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            getItemLayout={(_, index) => ({
              length: pagerWidth,
              offset: pagerWidth * index,
              index,
            })}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            style={styles.pager}
            onLayout={(e) => {
              setPagerWidth(e.nativeEvent.layout.width);
              setPagerHeight(e.nativeEvent.layout.height);
            }}
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
