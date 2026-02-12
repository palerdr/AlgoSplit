import { useMemo } from 'react';
import { calculateEffectiveReps } from '@/lib/utils';
import type { WorkoutHistoryResponse } from '@/types/api.types';

// Discrete 6-step color scale for effective reps 0-5
const ER_COLORS: Record<number, string> = {
  0: '#64748b', // slate
  1: '#6366f1', // indigo
  2: '#06b6d4', // cyan
  3: '#eab308', // yellow
  4: '#f97316', // orange
  5: '#22c55e', // green
};

export function getERColor(er: number): string {
  const clamped = Math.round(Math.min(5, Math.max(0, er)));
  return ER_COLORS[clamped] ?? ER_COLORS[0];
}

interface ExerciseListPanelProps {
  workoutsData: WorkoutHistoryResponse;
  selectedExercise: string;
  onSelectExercise: (name: string) => void;
}

interface ExerciseEntry {
  name: string;
  lastDate: string;
  latestER: number; // avg ER of most recent session
}

export function ExerciseListPanel({
  workoutsData,
  selectedExercise,
  onSelectExercise,
}: ExerciseListPanelProps) {
  const exercises = useMemo(() => {
    if (!workoutsData?.workouts) return [];

    // Build per-exercise session data
    // Map: exerciseName -> array of { date, avgER }
    const exerciseMap = new Map<string, { date: string; avgER: number }[]>();

    // Sort oldest first so sessions are in chronological order
    const sorted = [...workoutsData.workouts].sort(
      (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
    );

    for (const workout of sorted) {
      for (const ex of workout.exercises) {
        const ers: number[] = [];
        for (let i = 0; i < ex.sets_completed; i++) {
          ers.push(calculateEffectiveReps(ex.reps[i], ex.rir?.[i] ?? null));
        }
        const avgER = ers.length > 0 ? ers.reduce((a, b) => a + b, 0) / ers.length : 0;

        if (!exerciseMap.has(ex.exercise_name)) {
          exerciseMap.set(ex.exercise_name, []);
        }
        exerciseMap.get(ex.exercise_name)!.push({ date: workout.completed_at, avgER });
      }
    }

    // Build entries sorted by most recently performed
    const entries: ExerciseEntry[] = [];
    for (const [name, sessions] of exerciseMap) {
      const lastDate = sessions[sessions.length - 1].date;
      const latestER = sessions[sessions.length - 1].avgER;
      entries.push({ name, lastDate, latestER });
    }

    entries.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
    return entries;
  }, [workoutsData]);

  if (exercises.length === 0) return null;

  return (
    <div className="flex flex-col h-full max-h-[500px]">
      {/* Scrollable exercise list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
        {exercises.map((ex) => {
          const isSelected = ex.name.toLowerCase() === selectedExercise.toLowerCase();
          return (
            <button
              key={ex.name}
              onClick={() => onSelectExercise(ex.name)}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left transition-colors ${
                isSelected
                  ? 'bg-crimson/10 border border-crimson/30'
                  : 'hover:bg-steel border border-transparent'
              }`}
            >
              <span
                className={`text-sm truncate ${isSelected ? 'text-crimson font-medium' : 'text-secondary'}`}
                style={{ maxWidth: '9rem' }}
                title={ex.name}
              >
                {ex.name}
              </span>
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: getERColor(ex.latestER) }}
              />
            </button>
          );
        })}
      </div>

      {/* ER color legend - fixed at bottom */}
      <div className="flex items-center justify-center gap-1.5 pt-2 border-t border-white/5 mt-2 shrink-0">
        <span className="text-[10px] text-muted mr-0.5">ER</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex flex-col items-center gap-0.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: getERColor(n) }}
            />
            <span className="text-[9px] text-muted">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
