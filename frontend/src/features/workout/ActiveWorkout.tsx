import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Check, Clock, CalendarClock } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, ConfirmDialog } from '@/components/ui';
import { ExerciseCard } from './ExerciseCard';
import { ExercisePicker } from './ExercisePicker';
import { RestTimer } from './RestTimer';
import { useWorkoutStore, type WorkoutExercise } from './workoutStore';
import { logWorkout, workoutKeys } from '@/api/workouts.api';
import { programKeys } from '@/api/programs.api';
import { reorderExercisesInSplit, splitKeys } from '@/api/splits.api';
import { getErrorMessage } from '@/api/client';

function SortableExerciseCard({
  exercise,
  previousExerciseData,
  splitId,
}: {
  exercise: WorkoutExercise;
  previousExerciseData?: { reps: number[]; weight: number[]; rir?: (number | null)[] };
  splitId?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ExerciseCard
        exercise={exercise}
        previousExerciseData={previousExerciseData}
        splitId={splitId}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function ActiveWorkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Tick every second to keep elapsed time live
  useEffect(() => {
    const interval = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const { activeWorkout, addExercise, cancelWorkout, getWorkoutData, reorderExercises } =
    useWorkoutStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activeWorkout || active.id === over.id) return;

    const oldIndex = activeWorkout.exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = activeWorkout.exercises.findIndex((ex) => ex.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      reorderExercises(oldIndex, newIndex);

      // Propagate reorder to split template
      if (activeWorkout.splitId) {
        const reordered = [...activeWorkout.exercises];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        const names = reordered.map((ex) => ex.name);
        reorderExercisesInSplit(activeWorkout.splitId, activeWorkout.sessionName, names)
          .then(() => queryClient.invalidateQueries({ queryKey: splitKeys.all }))
          .catch((err) => console.error('Failed to update split order:', err));
      }
    }
  };

  const logWorkoutMutation = useMutation({
    mutationFn: logWorkout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workoutKeys.stats() });
      queryClient.invalidateQueries({ queryKey: programKeys.todaySessions() });
      queryClient.invalidateQueries({ queryKey: programKeys.details() });
      cancelWorkout(); // Clear the active workout
      navigate('/history');
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  if (!activeWorkout) {
    return null;
  }

  // Calculate elapsed time
  const isRetro = !!activeWorkout.retroDate;
  const startDate = new Date(activeWorkout.startedAt);
  const startTimeStr = isRetro
    ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const elapsedMs = Date.now() - startDate.getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedH = Math.floor(elapsedSec / 3600);
  const elapsedM = Math.floor((elapsedSec % 3600) / 60);
  const elapsedS = elapsedSec % 60;
  const elapsedStr = isRetro
    ? 'Past workout'
    : elapsedH > 0
      ? `${elapsedH}:${String(elapsedM).padStart(2, '0')}:${String(elapsedS).padStart(2, '0')}`
      : `${elapsedM}:${String(elapsedS).padStart(2, '0')}`;

  // Count sets with data (reps > 0) - these will be saved
  const totalSetsWithData = activeWorkout.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.reps > 0).length,
    0
  );

  const handleAddExercise = (name: string) => {
    addExercise(name);
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

  return (
    <div className="min-h-screen bg-iron">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-charcoal border-b border-white/8">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {activeWorkout.sessionName}
            </h1>
            <div className="flex items-center gap-3 text-sm text-secondary">
              <span className="flex items-center gap-1">
                {isRetro ? <CalendarClock size={14} /> : <Clock size={14} />}
                <span className="font-mono tabular-nums">{startTimeStr} · {elapsedStr}</span>
              </span>
              <span>{totalSetsWithData} sets</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="p-2 text-muted hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>
            <Button
              onClick={() => setShowFinishConfirm(true)}
              disabled={totalSetsWithData === 0}
              size="sm"
            >
              <Check size={16} className="mr-1" />
              Finish
            </Button>
          </div>
        </div>
      </div>

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

      {/* Exercises */}
      <div className="p-4 space-y-4">
        {activeWorkout.exercises.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted mb-4">No exercises added yet</p>
            <Button onClick={() => setShowExercisePicker(true)}>
              <Plus size={16} className="mr-1" />
              Add First Exercise
            </Button>
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeWorkout.exercises.map((ex) => ex.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeWorkout.exercises.map((exercise) => (
                  <SortableExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    previousExerciseData={activeWorkout.previousData?.[exercise.name]}
                    splitId={activeWorkout.splitId}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Add exercise button */}
            <button
              onClick={() => setShowExercisePicker(true)}
              className="w-full py-4 border border-dashed border-white/12 rounded-md text-secondary hover:text-foreground hover:border-white/20 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add Exercise
            </button>
          </>
        )}
      </div>

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
          activeWorkout.exercises.filter((e) =>
            e.sets.some((s) => s.reps > 0)
          ).length
        } exercises?`}
        confirmText="Save Workout"
        loading={logWorkoutMutation.isPending}
      />
    </div>
  );
}
