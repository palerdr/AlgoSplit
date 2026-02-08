import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Calendar, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Spinner, Button, ConfirmDialog } from '@/components/ui';
import { getWorkout, deleteWorkout, workoutKeys } from '@/api/workouts.api';
import { formatDate, formatTime, formatDuration, calculate1RM } from '@/lib/utils';

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: workout, isLoading, error } = useQuery({
    queryKey: workoutKeys.detail(id!),
    queryFn: () => getWorkout(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkout(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workoutKeys.stats() });
      navigate('/history');
    },
  });

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

  // Calculate totals
  const totalSets = workout.exercises.reduce(
    (acc, ex) => acc + ex.sets_completed,
    0
  );
  const totalVolume = workout.exercises.reduce((acc, ex) => {
    return (
      acc +
      ex.reps.reduce((setAcc, reps, i) => setAcc + reps * ex.weight[i], 0)
    );
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

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2 text-muted hover:text-error transition-colors"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center py-4">
          <p className="text-2xl font-bold font-mono text-foreground">
            {workout.exercises.length}
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
        {workout.exercises.map((exercise) => {
          // Find best set
          let bestSetIndex = 0;
          let best1RM = 0;
          exercise.reps.forEach((reps, i) => {
            const estimated1RM = calculate1RM(exercise.weight[i], reps);
            if (estimated1RM > best1RM) {
              best1RM = estimated1RM;
              bestSetIndex = i;
            }
          });

          return (
            <Card key={exercise.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {exercise.exercise_name}
                  </CardTitle>
                  <span className="text-sm text-muted">
                    {exercise.sets_completed} sets
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {/* Sets table */}
                <div className="space-y-1">
                  <div className="flex items-center text-xs text-muted py-1">
                    <div className="w-12">Set</div>
                    <div className="flex-1 text-right">Weight</div>
                    <div className="flex-1 text-right">Reps</div>
                    <div className="flex-1 text-right">Est. 1RM</div>
                  </div>
                  {exercise.reps.map((reps, i) => (
                    <div
                      key={i}
                      className={`flex items-center py-2 px-2 rounded-md ${
                        i === bestSetIndex ? 'bg-crimson/5' : ''
                      }`}
                    >
                      <div className="w-12 font-mono text-muted">{i + 1}</div>
                      <div className="flex-1 text-right font-mono">
                        {exercise.weight[i]}
                        <span className="text-muted text-xs ml-0.5">lb</span>
                      </div>
                      <div className="flex-1 text-right font-mono">{reps}</div>
                      <div className="flex-1 text-right font-mono">
                        {calculate1RM(exercise.weight[i], reps)}
                        {i === bestSetIndex && (
                          <span className="ml-1 text-crimson text-xs">
                            best
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Exercise notes */}
                {exercise.notes && (
                  <p className="mt-3 pt-3 border-t border-white/8 text-sm text-secondary">
                    {exercise.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
