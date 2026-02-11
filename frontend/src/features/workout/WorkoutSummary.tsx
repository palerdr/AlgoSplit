import { Clock, Dumbbell, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { type WorkoutExercise } from './workoutStore';
import { useSettingsStore, formatWeightWithUnit } from '@/stores/settingsStore';

interface WorkoutSummaryProps {
  sessionName: string;
  startedAt: string;
  exercises: WorkoutExercise[];
  onAddExercise: () => void;
}

export function WorkoutSummary({
  sessionName,
  startedAt,
  exercises,
  onAddExercise,
}: WorkoutSummaryProps) {
  const units = useSettingsStore((s) => s.units);

  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const elapsedMin = Math.round(elapsedMs / 60000);

  const exercisesWithData = exercises.filter((ex) => ex.sets.some((s) => s.reps > 0));

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Title banner */}
      <div className="bg-crimson/10 border border-crimson/20 rounded-lg p-4 text-center">
        <h2 className="text-xl font-bold text-foreground">{sessionName}</h2>
        <div className="flex items-center justify-center gap-1 mt-1 text-sm text-secondary">
          <Clock size={14} />
          <span>{elapsedMin} min</span>
        </div>
      </div>

      {/* Exercise summaries */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {exercisesWithData.length === 0 ? (
          <div className="text-center py-8">
            <Dumbbell className="w-10 h-10 mx-auto mb-2 text-muted" />
            <p className="text-muted text-sm">No sets recorded yet</p>
          </div>
        ) : (
          exercisesWithData.map((exercise) => {
            const validSets = exercise.sets.filter((s) => s.reps > 0);
            const totalReps = validSets.reduce((sum, s) => sum + s.reps, 0);
            const totalVolume = validSets.reduce((sum, s) => sum + s.reps * s.weight, 0);

            return (
              <Card key={exercise.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-foreground text-sm">{exercise.name}</h3>
                      <p className="text-xs text-secondary mt-0.5">
                        {validSets.length} sets · {totalReps} reps · {formatWeightWithUnit(totalVolume, units)} vol
                      </p>
                    </div>
                  </div>

                  {/* Set detail */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {validSets.map((set, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-steel rounded text-xs font-mono text-secondary"
                      >
                        {set.weight}×{set.reps}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add exercise button */}
      <button
        onClick={onAddExercise}
        className="w-full py-3 border border-dashed border-white/12 rounded-md text-secondary hover:text-foreground hover:border-white/20 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <Plus size={16} />
        Add Exercise
      </button>
    </div>
  );
}
