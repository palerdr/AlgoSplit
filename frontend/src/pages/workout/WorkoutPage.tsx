import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, ChevronRight, Plus, Loader2, Calendar, Play } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { useWorkoutStore, ActiveWorkout } from '@/features/workout';
import { getWorkouts } from '@/api/workouts.api';
import { getTodaySessions, getProgramSessionExercises, programKeys } from '@/api/programs.api';
import type { TodaySessionItem } from '@/types/api.types';

// Quick start templates
const QUICK_START_TEMPLATES = [
  'Push Day',
  'Pull Day',
  'Leg Day',
  'Upper Body',
  'Lower Body',
  'Full Body',
  'Arms',
  'Back & Biceps',
  'Chest & Triceps',
];

function formatTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WorkoutPage() {
  const { activeWorkout, startWorkout, startWorkoutFromSession } = useWorkoutStore();
  const [customName, setCustomName] = useState('');
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const todayDate = formatTodayDate();

  const { data: todaySessions } = useQuery({
    queryKey: programKeys.todaySessions(todayDate),
    queryFn: () => getTodaySessions(todayDate),
  });

  // If there's an active workout, show it
  if (activeWorkout) {
    return <ActiveWorkout />;
  }

  const handleStartWorkout = (name: string) => {
    startWorkout(name);
  };

  const handleStartCustom = () => {
    if (customName.trim()) {
      handleStartWorkout(customName.trim());
    }
  };

  const handleStartFromProgramSession = async (session: TodaySessionItem) => {
    setLoadingSessionId(session.id);
    try {
      const resolved = await getProgramSessionExercises(session.program_id, session.id);
      const exercises = resolved.exercises.map((ex) => ({
        name: ex.exercise_name,
        sets: ex.sets,
        unilateral: ex.unilateral,
      }));

      let previousData: Record<string, { reps: number[]; weight: number[] }> | undefined;
      try {
        const history = await getWorkouts({ limit: 20, days: 90 });
        const previousWorkout = history.workouts.find(
          (w) => w.session_name === session.display_name
        );
        if (previousWorkout) {
          previousData = {};
          for (const ex of previousWorkout.exercises) {
            previousData[ex.exercise_name] = {
              reps: ex.reps,
              weight: ex.weight,
            };
          }
        }
      } catch {
        // Non-critical
      }

      startWorkoutFromSession(
        session.display_name,
        exercises,
        previousData,
        undefined,
        undefined,
        session.id,
      );
    } finally {
      setLoadingSessionId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Start Workout</h1>
        <p className="text-secondary">Choose a template or start fresh</p>
      </div>

      {/* Custom workout name */}
      <Card>
        <div className="flex gap-3">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Enter workout name..."
            onKeyDown={(e) => e.key === 'Enter' && handleStartCustom()}
          />
          <Button onClick={handleStartCustom} disabled={!customName.trim()}>
            <Dumbbell className="mr-2 h-4 w-4" />
            Start
          </Button>
        </div>
      </Card>

      {/* Today's Scheduled Sessions */}
      {todaySessions && todaySessions.sessions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted mb-3 flex items-center gap-1.5">
            <Calendar size={14} />
            Scheduled Today
          </h2>
          <div className="space-y-2">
            {todaySessions.sessions.map((session) => (
              <Card key={session.id} variant="interactive" className="p-0">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <h3 className="font-medium text-foreground">{session.display_name}</h3>
                    <p className="text-xs text-muted">{session.program_name}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleStartFromProgramSession(session)}
                    disabled={loadingSessionId === session.id}
                  >
                    {loadingSessionId === session.id ? (
                      <Loader2 size={14} className="animate-spin mr-1" />
                    ) : (
                      <Play size={14} className="mr-1" />
                    )}
                    Start
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick start templates */}
      <div>
        <h2 className="text-sm font-medium text-muted mb-3">Quick Start</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {QUICK_START_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => handleStartWorkout(template)}
              className="flex items-center justify-between px-4 py-3 bg-charcoal border border-white/8 rounded-md hover:border-white/12 hover:bg-steel transition-colors"
            >
              <span className="font-medium">{template}</span>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </div>
      </div>

      {/* Empty workout option */}
      <button
        onClick={() => handleStartWorkout('Workout')}
        className="w-full flex items-center justify-center gap-2 py-4 border border-dashed border-white/12 rounded-md text-secondary hover:text-foreground hover:border-white/20 transition-colors"
      >
        <Plus size={20} />
        Start Empty Workout
      </button>
    </div>
  );
}
