import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, GripVertical } from 'lucide-react';
import { Card } from '@/components/ui';
import { SetRow } from './SetRow';
import { type WorkoutExercise, useWorkoutStore } from './workoutStore';
import { cn } from '@/lib/utils';

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  previousExerciseData?: { reps: number[]; weight: number[] };
}

export function ExerciseCard({
  exercise,
  previousExerciseData,
}: ExerciseCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const {
    addSet,
    removeSet,
    updateSet,
    completeSet,
    updateExerciseNotes,
    removeExercise,
  } = useWorkoutStore();

  const isUnilateral = exercise.unilateral ?? false;
  const completedSets = exercise.sets.filter((s) => s.completed).length;
  const totalSets = exercise.sets.length;
  const logicalSets = isUnilateral ? Math.floor(totalSets / 2) : totalSets;
  const logicalCompleted = isUnilateral ? Math.floor(completedSets / 2) : completedSets;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-steel/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="text-muted cursor-grab">
          <GripVertical size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">
            {exercise.name}
          </h3>
          <p className="text-sm text-secondary">
            {logicalCompleted}/{logicalSets} sets completed
          </p>
        </div>

        <div className="flex items-center gap-2">
          {completedSets === totalSets && totalSets > 0 && (
            <span className="px-2 py-0.5 bg-crimson/10 text-crimson text-xs font-medium rounded">
              Done
            </span>
          )}
          {isExpanded ? (
            <ChevronUp size={20} className="text-muted" />
          ) : (
            <ChevronDown size={20} className="text-muted" />
          )}
        </div>
      </div>

      {/* Sets */}
      {isExpanded && (
        <div className="border-t border-white/8">
          {/* Column headers */}
          <div className="flex items-center gap-2 py-2 px-3 text-xs text-secondary font-medium">
            <div className="w-8 text-center">Set</div>
            <div className="w-20 text-center">Prev</div>
            <div className="flex-1 text-center">Weight</div>
            <div className="flex-1 text-center">Reps</div>
            <div className="w-14 text-center">RIR</div>
            <div className="w-9" />
            <div className="w-9" />
          </div>

          {/* Set rows */}
          <div className="space-y-1 px-1">
            {isUnilateral
              ? // Render L/R pairs grouped under a set number
                Array.from({ length: logicalSets }).map((_, pairIndex) => {
                  const lIndex = pairIndex * 2;
                  const rIndex = pairIndex * 2 + 1;
                  const lSet = exercise.sets[lIndex];
                  const rSet = exercise.sets[rIndex];
                  if (!lSet || !rSet) return null;
                  return (
                    <div key={pairIndex}>
                      <SetRow
                        setIndex={pairIndex}
                        data={lSet}
                        sideLabel="L"
                        previousSet={
                          previousExerciseData && previousExerciseData.reps[lIndex] != null
                            ? {
                                reps: previousExerciseData.reps[lIndex],
                                weight: previousExerciseData.weight[lIndex],
                              }
                            : undefined
                        }
                        onUpdate={(data) => updateSet(exercise.id, lIndex, data)}
                        onComplete={() => completeSet(exercise.id, lIndex)}
                        onRemove={() => removeSet(exercise.id, lIndex)}
                        canRemove={logicalSets > 1}
                      />
                      <SetRow
                        setIndex={pairIndex}
                        data={rSet}
                        sideLabel="R"
                        previousSet={
                          previousExerciseData && previousExerciseData.reps[rIndex] != null
                            ? {
                                reps: previousExerciseData.reps[rIndex],
                                weight: previousExerciseData.weight[rIndex],
                              }
                            : undefined
                        }
                        onUpdate={(data) => updateSet(exercise.id, rIndex, data)}
                        onComplete={() => completeSet(exercise.id, rIndex)}
                        onRemove={() => removeSet(exercise.id, rIndex)}
                        canRemove={false}
                      />
                    </div>
                  );
                })
              : exercise.sets.map((set, index) => (
                  <SetRow
                    key={index}
                    setIndex={index}
                    data={set}
                    previousSet={
                      previousExerciseData && previousExerciseData.reps[index]
                        ? {
                            reps: previousExerciseData.reps[index],
                            weight: previousExerciseData.weight[index],
                          }
                        : undefined
                    }
                    onUpdate={(data) => updateSet(exercise.id, index, data)}
                    onComplete={() => completeSet(exercise.id, index)}
                    onRemove={() => removeSet(exercise.id, index)}
                    canRemove={exercise.sets.length > 1}
                  />
                ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 p-3 border-t border-white/8">
            <button
              onClick={() => addSet(exercise.id)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-secondary hover:text-foreground hover:bg-steel rounded-md transition-colors"
            >
              <Plus size={16} />
              Add Set
            </button>

            <button
              onClick={() => setShowNotes(!showNotes)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                showNotes || exercise.notes
                  ? 'text-crimson bg-crimson/10'
                  : 'text-secondary hover:text-foreground hover:bg-steel'
              )}
            >
              Notes
            </button>

            <div className="flex-1" />

            <button
              onClick={() => removeExercise(exercise.id)}
              className="p-1.5 text-muted hover:text-error transition-colors"
              title="Remove exercise"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Notes field */}
          {showNotes && (
            <div className="px-3 pb-3">
              <textarea
                value={exercise.notes}
                onChange={(e) =>
                  updateExerciseNotes(exercise.id, e.target.value)
                }
                placeholder="Add notes for this exercise..."
                className="w-full h-20 px-3 py-2 bg-steel border border-white/8 rounded-md text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:border-crimson"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
