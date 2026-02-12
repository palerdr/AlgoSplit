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
  days: number;
}

interface ExerciseEntry {
  name: string;
  lastDate: string;
  recentSessions: number[]; // avg ER per session, last 5
}

export function ExerciseListPanel({
  workoutsData,
  selectedExercise,
  onSelectExercise,
  days,
}: ExerciseListPanelProps) {
  const exercises = useMemo(() => {
    if (!workoutsData?.workouts) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Filter workouts within date range
    const filtered = workoutsData.workouts.filter(
      (w) => new Date(w.completed_at).getTime() >= cutoff
    );

    // Build per-exercise session data
    // Map: exerciseName -> array of { date, avgER }
    const exerciseMap = new Map<string, { date: string; avgER: number }[]>();

    // Sort oldest first so sessions are in chronological order
    const sorted = [...filtered].sort(
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
      const recentSessions = sessions.slice(-5).map((s) => s.avgER);
      entries.push({ name, lastDate, recentSessions });
    }

    entries.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
    return entries;
  }, [workoutsData, days]);

  if (exercises.length === 0) return null;

  return (
    <div className="space-y-0.5">
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
            <div className="flex gap-0.5 shrink-0">
              {ex.recentSessions.map((er, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: getERColor(er) }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
