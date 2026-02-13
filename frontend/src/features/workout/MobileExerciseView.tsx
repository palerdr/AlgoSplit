import { useState } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { SetRow } from './SetRow';
import { MobileExerciseMenu } from './MobileExerciseMenu';
import { type WorkoutExercise, useWorkoutStore } from './workoutStore';

interface MobileExerciseViewProps {
  exercise: WorkoutExercise;
  previousExerciseData?: { reps: number[]; weight: number[]; rir?: (number | null)[] };
  splitId?: string;
  onViewStats: () => void;
}

export function MobileExerciseView({
  exercise,
  previousExerciseData,
  splitId,
  onViewStats,
}: MobileExerciseViewProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);

  const {
    addSet,
    removeSet,
    updateSet,
    completeSet,
    updateExerciseNotes,
    removeExercise,
  } = useWorkoutStore();

  const isUnilateral = exercise.unilateral ?? false;
  const totalSets = exercise.sets.length;
  const logicalSets = isUnilateral ? Math.floor(totalSets / 2) : totalSets;
  const completedSets = exercise.sets.filter((s) => s.completed).length;
  const logicalCompleted = isUnilateral ? Math.floor(completedSets / 2) : completedSets;

  return (
    <div className="flex flex-col h-full">
      {/* Exercise header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{exercise.name}</h2>
          <p className="text-sm text-secondary">
            {logicalCompleted}/{logicalSets} sets completed
          </p>
        </div>
        <button
          onClick={() => setShowMenu(true)}
          className="p-2 text-muted hover:text-foreground transition-colors"
        >
          <MoreVertical size={20} />
        </button>

        <MobileExerciseMenu
          isOpen={showMenu}
          onClose={() => setShowMenu(false)}
          onReplace={() => {/* handled by parent */}}
          onViewStats={onViewStats}
          onReset={() => {/* would show confirm dialog */}}
          onRemove={() => removeExercise(exercise.id)}
          showReplace={!!splitId}
        />
      </div>

      {/* Set rows */}
      <div className="flex-1 overflow-y-auto px-1 space-y-1">
        {isUnilateral
          ? Array.from({ length: logicalSets }).map((_, pairIndex) => {
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
                        ? { reps: previousExerciseData.reps[lIndex], weight: previousExerciseData.weight[lIndex], rir: previousExerciseData.rir?.[lIndex] }
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
                        ? { reps: previousExerciseData.reps[rIndex], weight: previousExerciseData.weight[rIndex], rir: previousExerciseData.rir?.[rIndex] }
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
                  previousExerciseData && previousExerciseData.reps[index] != null
                    ? { reps: previousExerciseData.reps[index], weight: previousExerciseData.weight[index], rir: previousExerciseData.rir?.[index] }
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
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            showNotes || exercise.notes
              ? 'text-crimson bg-crimson/10'
              : 'text-secondary hover:text-foreground hover:bg-steel'
          }`}
        >
          Notes
        </button>
      </div>

      {/* Notes field */}
      {showNotes && (
        <div className="px-3 pb-3">
          <textarea
            value={exercise.notes}
            onChange={(e) => updateExerciseNotes(exercise.id, e.target.value)}
            placeholder="Add notes for this exercise..."
            className="w-full h-20 px-3 py-2 bg-steel border border-white/8 rounded-md text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:border-crimson"
          />
        </div>
      )}
    </div>
  );
}
