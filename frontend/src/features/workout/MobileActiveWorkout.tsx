import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui';
import { MobileWorkoutHeader } from './MobileWorkoutHeader';
import { MobileExerciseView } from './MobileExerciseView';
import { MobileExerciseNav } from './MobileExerciseNav';
import { WorkoutSummary } from './WorkoutSummary';
import { ExercisePicker } from './ExercisePicker';
import { RestTimer } from './RestTimer';
import { useWorkoutStore } from './workoutStore';
import { logWorkout, workoutKeys } from '@/api/workouts.api';
import { programKeys } from '@/api/programs.api';
import { getErrorMessage } from '@/api/client';

interface MobileActiveWorkoutProps {
  onSwitchToList?: () => void;
}

export function MobileActiveWorkout({ onSwitchToList }: MobileActiveWorkoutProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Touch swipe state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const { activeWorkout, addExercise, cancelWorkout, getWorkoutData } = useWorkoutStore();

  const logWorkoutMutation = useMutation({
    mutationFn: logWorkout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workoutKeys.stats() });
      queryClient.invalidateQueries({ queryKey: programKeys.todaySessions() });
      queryClient.invalidateQueries({ queryKey: programKeys.details() });
      cancelWorkout();
      navigate('/history');
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || !activeWorkout) return;

      // Don't swipe when interacting with inputs/buttons
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.closest('button')) {
        touchStartRef.current = null;
        return;
      }

      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // Require 50px horizontal threshold and 2:1 horizontal/vertical ratio
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 2) return;

      const maxIndex = activeWorkout.exercises.length; // summary page
      if (dx < 0) setCurrentIndex((i) => Math.min(maxIndex, i + 1));
      else if (dx > 0) setCurrentIndex((i) => Math.max(0, i - 1));
    },
    [activeWorkout?.exercises.length]
  );

  // Clamp currentIndex when exercises are removed
  useEffect(() => {
    if (activeWorkout) {
      const maxIndex = activeWorkout.exercises.length;
      setCurrentIndex((i) => Math.min(i, maxIndex));
    }
  }, [activeWorkout?.exercises.length]);

  if (!activeWorkout) return null;

  // If viewMode is 'list', the parent should render <ActiveWorkout /> instead.
  // This component only handles carousel mode.

  const exerciseCount = activeWorkout.exercises.length;
  const isRetro = !!activeWorkout.retroDate;

  const totalSetsWithData = activeWorkout.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.reps > 0).length,
    0
  );

  const handleAddExercise = (name: string) => {
    const currentLength = activeWorkout.exercises.length;
    addExercise(name);
    setShowExercisePicker(false);
    setCurrentIndex(currentLength); // new exercise is at this index
  };

  const handleCancel = () => {
    cancelWorkout();
    navigate('/dashboard');
  };

  const handleFinish = () => {
    const data = getWorkoutData();
    if (!data || data.exercises.length === 0) {
      setError('Enter reps for at least one set before finishing');
      setShowFinishConfirm(false);
      return;
    }

    logWorkoutMutation.mutate({
      session_name: data.sessionName,
      exercises: data.exercises,
      duration_minutes: data.durationMinutes,
      completed_at: data.completedAt,
      session_id: data.sessionId,
      split_id: data.splitId,
      program_session_id: data.programSessionId,
    });
  };

  const handleViewStats = () => {
    navigate('/progress');
  };

  // Determine what to render based on currentIndex
  const isSummary = currentIndex >= exerciseCount;
  const currentExercise = !isSummary ? activeWorkout.exercises[currentIndex] : null;

  return (
    <div
      className="min-h-screen bg-iron flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <MobileWorkoutHeader
        sessionName={activeWorkout.sessionName}
        startedAt={activeWorkout.startedAt}
        isRetro={isRetro}
        totalSetsWithData={totalSetsWithData}
        onAddExercise={() => setShowExercisePicker(true)}
        onReorder={() => onSwitchToList?.()}
        onSwitchToList={() => onSwitchToList?.()}
        onCancel={() => setShowCancelConfirm(true)}
      />

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-error/10 border border-error/20 rounded-md">
          <p className="text-sm text-error">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-error/80 hover:text-error mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content area — single exercise or summary */}
      <div className="flex-1 pb-32">
        {exerciseCount === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted mb-4">No exercises added yet</p>
            <button
              onClick={() => setShowExercisePicker(true)}
              className="px-4 py-2 bg-crimson text-white rounded-md text-sm font-medium hover:bg-crimson/90 transition-colors"
            >
              Add First Exercise
            </button>
          </div>
        ) : isSummary ? (
          <WorkoutSummary
            sessionName={activeWorkout.sessionName}
            startedAt={activeWorkout.startedAt}
            exercises={activeWorkout.exercises}
            onAddExercise={() => setShowExercisePicker(true)}
          />
        ) : currentExercise ? (
          <MobileExerciseView
            key={currentExercise.id}
            exercise={currentExercise}
            previousExerciseData={activeWorkout.previousData?.[currentExercise.name]}
            splitId={activeWorkout.splitId}
            onViewStats={handleViewStats}
          />
        ) : null}
      </div>

      {/* Bottom navigation */}
      {exerciseCount > 0 && (
        <MobileExerciseNav
          currentIndex={currentIndex}
          totalExercises={exerciseCount}
          onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          onNext={() => setCurrentIndex((i) => Math.min(exerciseCount, i + 1))}
          onFinish={() => setShowFinishConfirm(true)}
        />
      )}

      {/* Rest Timer */}
      <RestTimer />

      {/* Exercise Picker Modal */}
      <ExercisePicker
        isOpen={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={handleAddExercise}
      />

      {/* Cancel Confirmation */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel Workout?"
        description="All progress will be lost. This action cannot be undone."
        confirmText="Cancel Workout"
        variant="destructive"
      />

      {/* Finish Confirmation */}
      <ConfirmDialog
        isOpen={showFinishConfirm}
        onClose={() => setShowFinishConfirm(false)}
        onConfirm={handleFinish}
        title="Finish Workout?"
        description={`Save ${totalSetsWithData} sets across ${
          activeWorkout.exercises.filter((e) => e.sets.some((s) => s.reps > 0)).length
        } exercises?`}
        confirmText="Save Workout"
        loading={logWorkoutMutation.isPending}
      />
    </div>
  );
}
