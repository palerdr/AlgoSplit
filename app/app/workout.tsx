import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
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
  const scrollRef = useRef<ScrollView>(null);

  // Wait for Zustand to hydrate from AsyncStorage before reading any state.
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

  // After hydration + layout, scroll to the persisted exercise index once.
  // All children are already mounted (no virtualization), so scrollTo is
  // a direct native call that pagingEnabled doesn't interfere with.
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!hydrated || exerciseCount === 0 || pagerHeight === 0) return;
    if (hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    const target = Math.max(0, Math.min(exerciseCount, useWorkoutStore.getState().currentExerciseIndex));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: target * pagerWidth, animated: false });
    });
  }, [hydrated, exerciseCount, pagerHeight, pagerWidth]);

  // Clamp currentIndex if exercises removed
  useEffect(() => {
    if (exerciseCount === 0) return;
    const max = exerciseCount; // summary page
    if (currentIndex > max) setCurrentIndex(max);
  }, [exerciseCount, currentIndex, setCurrentIndex]);

  // Debounced onScroll keeps the dot index in sync on every swipe.
  // onMomentumScrollEnd doesn't fire when the finger lifts exactly on a
  // page boundary (no momentum phase), so we need this as the primary
  // tracker. Once scroll events stop for 80ms the page has settled.
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitIndex = useCallback(
    (offsetX: number) => {
      const index = Math.round(offsetX / pagerWidth);
      const clamped = Math.max(0, Math.min(exerciseCount, index));
      setCurrentIndex(clamped);
    },
    [exerciseCount, pagerWidth, setCurrentIndex],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isDismissing.current) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = setTimeout(() => commitIndex(offsetX), 80);
    },
    [commitIndex],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      if (isDismissing.current) return;
      commitIndex(e.nativeEvent.contentOffset.x);
    },
    [commitIndex],
  );

  const scrollToPage = useCallback(
    (index: number) => {
      const target = Math.max(0, Math.min(exerciseCount, index));
      scrollRef.current?.scrollTo({ x: target * pagerWidth, animated: true });
      setCurrentIndex(target);
    },
    [exerciseCount, pagerWidth, setCurrentIndex],
  );

  const handleAddExercise = (name: string) => {
    const afterIdx = insertAfterIndex.current;
    if (afterIdx != null) {
      insertExercise(name, afterIdx);
      insertAfterIndex.current = null;
      setShowPicker(false);
      setTimeout(() => scrollToPage(afterIdx + 1), 100);
    } else {
      addExercise(name);
      setShowPicker(false);
      setTimeout(() => {
        const count = useWorkoutStore.getState().activeWorkout?.exercises.length ?? 0;
        scrollToPage(count - 1);
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
    cancelWorkout();
    safeDismiss();
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

  const pageStyle = { width: pagerWidth, height: pagerHeight || undefined, paddingBottom: pagerHeight ? pagerHeight * 0.2 : 0 };

  if (!hydrated || !activeWorkout) {
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
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            style={styles.pager}
            onLayout={(e) => {
              if (isDismissing.current) return;
              setPagerWidth(e.nativeEvent.layout.width);
              setPagerHeight(e.nativeEvent.layout.height);
            }}
          >
            {exercises.map((exercise, index) => (
              <View key={exercise.id} style={[styles.pageWrapper, pageStyle]}>
                <View style={styles.card}>
                  <ExerciseViewMobile
                    exercise={exercise}
                    previousExerciseData={previousData?.[exercise.name]}
                    onAddAfter={() => { insertAfterIndex.current = index; setShowPicker(true); }}
                  />
                </View>
              </View>
            ))}
            <View key="summary" style={[styles.pageWrapper, styles.summaryPageWrapper, pageStyle, { paddingBottom: 0 }]}>
              <View style={[styles.card, styles.summaryCard]}>
                <WorkoutSummaryMobile
                  sessionName={sessionName}
                  startedAt={startedAt}
                  exercises={exercises}
                />
              </View>
            </View>
          </ScrollView>

          <ExerciseNavMobile
            currentIndex={currentIndex}
            totalExercises={exerciseCount}
            isSaving={logWorkoutMutation.isPending}
            onPrev={() => scrollToPage(Math.max(0, currentIndex - 1))}
            onNext={() => scrollToPage(Math.min(exerciseCount, currentIndex + 1))}
            onFinish={handleFinish}
            onJump={scrollToPage}
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
