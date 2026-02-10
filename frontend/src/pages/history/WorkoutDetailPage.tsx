import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Calendar, Clock, Pencil, Save, X, Plus, Minus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Spinner, Button, ConfirmDialog } from '@/components/ui';
import { getWorkout, deleteWorkout, updateWorkout, workoutKeys } from '@/api/workouts.api';
import { analyzeSplit, analysisKeys } from '@/api/analysis.api';
import { ExercisePicker } from '@/features/workout/ExercisePicker';
import { formatDate, formatTime, formatDuration, calculate1RM } from '@/lib/utils';
import type { WorkoutExerciseResponse, SplitRequest, ExerciseBreakdown } from '@/types/api.types';

// Editable exercise shape — mirrors WorkoutExerciseResponse but mutable
interface EditableExercise {
  id: string;
  exercise_name: string;
  sets_completed: number;
  reps: number[];
  weight: number[];
  notes: string | null;
}

function toEditable(exercises: WorkoutExerciseResponse[]): EditableExercise[] {
  return exercises.map((ex) => ({
    id: ex.id,
    exercise_name: ex.exercise_name,
    sets_completed: ex.sets_completed,
    reps: [...ex.reps],
    weight: [...ex.weight],
    notes: ex.notes ?? null,
  }));
}

const TIER_COLORS: Record<string, { badge: string; label: string }> = {
  prime: { badge: 'bg-crimson/10 text-crimson', label: 'text-crimson' },
  secondary: { badge: 'bg-yellow-400/10 text-yellow-400', label: 'text-yellow-400' },
  tertiary: { badge: 'bg-blue-400/10 text-blue-400', label: 'text-blue-400' },
  quaternary: { badge: 'bg-white/5 text-muted', label: 'text-muted' },
};

function InlineBreakdown({ breakdown }: { breakdown: ExerciseBreakdown }) {
  const total = breakdown.muscle_contributions.reduce((s, mc) => s + mc.total_stimulus, 0);

  return (
    <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted mb-1">
        <span>{breakdown.pattern.replace(/_/g, ' ')} &middot; {breakdown.resistance_profile}</span>
        <span className="font-mono font-medium text-foreground">{total.toFixed(2)} total</span>
      </div>
      {breakdown.muscle_contributions.map((mc) => {
        const tier = TIER_COLORS[mc.tier] || TIER_COLORS.quaternary;
        return (
          <div key={mc.muscle_id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded ${tier.badge}`}>
                {mc.display_name}
              </span>
              <span className={`text-xs ${tier.label}`}>{mc.tier}</span>
            </div>
            <span className="font-mono text-sm text-foreground">{mc.total_stimulus.toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editExercises, setEditExercises] = useState<EditableExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const { data: workout, isLoading, error } = useQuery({
    queryKey: workoutKeys.detail(id!),
    queryFn: () => getWorkout(id!),
    enabled: !!id,
  });

  // Analyze workout for per-exercise stimulus breakdowns
  const analysisRequest: SplitRequest | null = workout
    ? {
        name: workout.session_name,
        sessions: [
          {
            name: workout.session_name,
            day: 1,
            exercises: workout.exercises.map((ex) => ({
              name: ex.exercise_name,
              sets: ex.sets_completed,
            })),
          },
        ],
        cycle_length: 7,
        stimulus_duration: 48,
        maintenance_volume: 3,
        dataset: 'pelland',
        include_breakdowns: true,
      }
    : null;

  const { data: analysisData } = useQuery({
    queryKey: ['workout-analysis', id, workout?.exercises.map((e) => `${e.exercise_name}:${e.sets_completed}`).join(',')],
    queryFn: () => analyzeSplit(analysisRequest!),
    enabled: !!analysisRequest && !editing,
  });

  // Build a lookup from exercise name → breakdown (by order to handle duplicates)
  const breakdownByIndex: Record<number, ExerciseBreakdown> = {};
  if (analysisData?.session_breakdowns?.[0]) {
    const exercises = analysisData.session_breakdowns[0].exercises;
    exercises.forEach((bd, i) => {
      breakdownByIndex[i] = bd;
    });
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkout(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workoutKeys.stats() });
      navigate('/history');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!workout) throw new Error('No workout');
      return updateWorkout(id!, {
        session_name: workout.session_name,
        duration_minutes: workout.duration_minutes ?? undefined,
        notes: workout.notes ?? undefined,
        exercises: editExercises.map((ex) => ({
          exercise_name: ex.exercise_name,
          sets_completed: ex.sets_completed,
          reps: ex.reps,
          weight: ex.weight,
          notes: ex.notes ?? undefined,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workoutKeys.stats() });
      queryClient.invalidateQueries({ queryKey: analysisKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workout-analysis', id] });
      setEditing(false);
    },
  });

  const startEditing = () => {
    if (!workout) return;
    setEditExercises(toEditable(workout.exercises));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditExercises([]);
  };

  // Edit helpers
  const updateSet = (exIdx: number, setIdx: number, field: 'reps' | 'weight', value: number) => {
    setEditExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      if (field === 'reps') {
        ex.reps = [...ex.reps];
        ex.reps[setIdx] = value;
      } else {
        ex.weight = [...ex.weight];
        ex.weight[setIdx] = value;
      }
      next[exIdx] = ex;
      return next;
    });
  };

  const addSet = (exIdx: number) => {
    setEditExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      const lastReps = ex.reps[ex.reps.length - 1] ?? 8;
      const lastWeight = ex.weight[ex.weight.length - 1] ?? 0;
      ex.reps = [...ex.reps, lastReps];
      ex.weight = [...ex.weight, lastWeight];
      ex.sets_completed = ex.reps.length;
      next[exIdx] = ex;
      return next;
    });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setEditExercises((prev) => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      ex.reps = ex.reps.filter((_, i) => i !== setIdx);
      ex.weight = ex.weight.filter((_, i) => i !== setIdx);
      ex.sets_completed = ex.reps.length;
      next[exIdx] = ex;
      if (ex.sets_completed === 0) return next.filter((_, i) => i !== exIdx);
      return next;
    });
  };

  const removeExercise = (exIdx: number) => {
    setEditExercises((prev) => prev.filter((_, i) => i !== exIdx));
  };

  const addExercise = (name: string) => {
    setEditExercises((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        exercise_name: name,
        sets_completed: 3,
        reps: [8, 8, 8],
        weight: [0, 0, 0],
        notes: null,
      },
    ]);
    setShowPicker(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !workout) {
    return (
      <div className="p-4 md:p-6 text-center">
        <p className="text-muted mb-4">Workout not found</p>
        <Link to="/history">
          <Button variant="secondary">Back to History</Button>
        </Link>
      </div>
    );
  }

  const displayExercises = editing ? editExercises : workout.exercises;

  const totalSets = displayExercises.reduce((acc, ex) => acc + ex.sets_completed, 0);
  const totalVolume = displayExercises.reduce((acc, ex) => {
    return acc + ex.reps.reduce((setAcc, reps, i) => setAcc + reps * (ex.weight[i] ?? 0), 0);
  }, 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="p-2 -ml-2 text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {workout.session_name}
            </h1>
            <div className="flex items-center gap-3 text-sm text-secondary mt-1">
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {formatDate(workout.completed_at)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatTime(workout.completed_at)}
              </span>
              {workout.duration_minutes && (
                <span>{formatDuration(workout.duration_minutes)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={cancelEditing}
                disabled={saveMutation.isPending}
              >
                <X size={14} className="mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || editExercises.length === 0}
              >
                {saveMutation.isPending ? (
                  <Spinner size="sm" />
                ) : (
                  <Save size={14} className="mr-1" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={startEditing}
                className="p-2 text-muted hover:text-foreground transition-colors"
                title="Edit workout"
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-muted hover:text-error transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center py-4">
          <p className="text-2xl font-bold font-mono text-foreground">
            {displayExercises.length}
          </p>
          <p className="text-xs text-muted">Exercises</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-bold font-mono text-foreground">
            {totalSets}
          </p>
          <p className="text-xs text-muted">Sets</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-bold font-mono text-foreground">
            {Math.round(totalVolume / 1000)}
            <span className="text-sm font-normal text-muted">k</span>
          </p>
          <p className="text-xs text-muted">Volume (lbs)</p>
        </Card>
      </div>

      {/* Notes */}
      {workout.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-secondary">{workout.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Exercises */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Exercises</h2>
        {displayExercises.map((exercise, exIdx) => {
          let bestSetIndex = 0;
          let best1RM = 0;
          exercise.reps.forEach((reps, i) => {
            const estimated1RM = calculate1RM(exercise.weight[i] ?? 0, reps);
            if (estimated1RM > best1RM) {
              best1RM = estimated1RM;
              bestSetIndex = i;
            }
          });

          const bd = breakdownByIndex[exIdx];

          return (
            <Card key={exercise.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {exercise.exercise_name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">
                      {exercise.sets_completed} sets
                    </span>
                    {editing && (
                      <button
                        onClick={() => removeExercise(exIdx)}
                        className="p-1 text-muted hover:text-error transition-colors"
                        title="Remove exercise"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Sets table */}
                <div className="space-y-1">
                  <div className="flex items-center text-xs text-muted py-1">
                    <div className="w-12">Set</div>
                    <div className="flex-1 text-right">Weight</div>
                    <div className="flex-1 text-right">Reps</div>
                    <div className="flex-1 text-right">{editing ? '' : 'Est. 1RM'}</div>
                  </div>
                  {exercise.reps.map((reps, i) => (
                    <div
                      key={i}
                      className={`flex items-center py-2 px-2 rounded-md ${
                        !editing && i === bestSetIndex ? 'bg-crimson/5' : ''
                      }`}
                    >
                      <div className="w-12 font-mono text-muted">{i + 1}</div>
                      {editing ? (
                        <>
                          <div className="flex-1 text-right">
                            <input
                              type="number"
                              value={exercise.weight[i]}
                              onChange={(e) => updateSet(exIdx, i, 'weight', parseFloat(e.target.value) || 0)}
                              className="w-20 bg-charcoal border border-white/10 rounded px-2 py-1 text-right font-mono text-sm text-foreground focus:outline-none focus:border-crimson/50"
                            />
                          </div>
                          <div className="flex-1 text-right">
                            <input
                              type="number"
                              value={reps}
                              onChange={(e) => updateSet(exIdx, i, 'reps', parseInt(e.target.value) || 0)}
                              className="w-16 bg-charcoal border border-white/10 rounded px-2 py-1 text-right font-mono text-sm text-foreground focus:outline-none focus:border-crimson/50"
                            />
                          </div>
                          <div className="flex-1 text-right">
                            <button
                              onClick={() => removeSet(exIdx, i)}
                              className="p-1 text-muted hover:text-error transition-colors"
                              title="Remove set"
                            >
                              <Minus size={14} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 text-right font-mono">
                            {exercise.weight[i]}
                            <span className="text-muted text-xs ml-0.5">lb</span>
                          </div>
                          <div className="flex-1 text-right font-mono">{reps}</div>
                          <div className="flex-1 text-right font-mono">
                            {calculate1RM(exercise.weight[i], reps)}
                            {i === bestSetIndex && (
                              <span className="ml-1 text-crimson text-xs">best</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {editing && (
                    <button
                      onClick={() => addSet(exIdx)}
                      className="flex items-center gap-1 text-xs text-secondary hover:text-foreground transition-colors mt-2 px-2 py-1"
                    >
                      <Plus size={12} />
                      Add Set
                    </button>
                  )}
                </div>

                {/* Exercise notes */}
                {!editing && exercise.notes && (
                  <p className="mt-3 pt-3 border-t border-white/8 text-sm text-secondary">
                    {exercise.notes}
                  </p>
                )}

                {/* Inline stimulus breakdown */}
                {!editing && bd && <InlineBreakdown breakdown={bd} />}
              </CardContent>
            </Card>
          );
        })}

        {editing && (
          <Button variant="secondary" onClick={() => setShowPicker(true)} className="w-full">
            <Plus size={16} className="mr-1" />
            Add Exercise
          </Button>
        )}
      </div>

      {/* Save error */}
      {saveMutation.isError && (
        <p className="text-sm text-error text-center">
          Failed to save changes. Please try again.
        </p>
      )}

      {/* Exercise picker for adding exercises in edit mode */}
      {showPicker && (
        <ExercisePicker
          isOpen={showPicker}
          onClose={() => setShowPicker(false)}
          onSelect={addExercise}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Workout?"
        description="This will permanently delete this workout from your history. This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
