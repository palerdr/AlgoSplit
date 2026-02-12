import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, ChevronRight, ChevronDown, ChevronLeft, Plus, Loader2, Calendar, Play, Layers } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { useWorkoutStore, ActiveWorkout } from '@/features/workout';
import { MobileActiveWorkout } from '@/features/workout/MobileActiveWorkout';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getWorkouts, workoutKeys } from '@/api/workouts.api';
import { getSplits, splitKeys } from '@/api/splits.api';
import { getTodaySessions, getProgramSessionExercises, programKeys } from '@/api/programs.api';
import type { TodaySessionItem, SessionResponse } from '@/types/api.types';

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

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAST_DAYS = 30;
const FUTURE_DAYS = 30;

function generateDateStrip(): Date[] {
  const dates: Date[] = [];
  const now = new Date();
  for (let i = PAST_DAYS; i >= -FUTURE_DAYS; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }
  return dates;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WorkoutPage() {
  const { activeWorkout, startWorkout, startWorkoutFromSession } = useWorkoutStore();
  const isMobile = useIsMobile();
  const [forceListView, setForceListView] = useState(false);
  const [customName, setCustomName] = useState('');
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [expandedSplitId, setExpandedSplitId] = useState<string | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => generateDateStrip(), []);

  const todayDate = formatTodayDate();

  const { data: todaySessions } = useQuery({
    queryKey: programKeys.todaySessions(todayDate),
    queryFn: () => getTodaySessions(todayDate),
  });

  const { data: splitsData } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  // Fetch recent workouts to mark dates with logged workouts
  const { data: recentWorkoutsData } = useQuery({
    queryKey: workoutKeys.list({ limit: 200, days: 90 }),
    queryFn: () => getWorkouts({ limit: 200, days: 90 }),
    enabled: !activeWorkout,
  });

  const workoutDates = useMemo(() => {
    const set = new Set<string>();
    if (!recentWorkoutsData?.workouts) return set;
    for (const w of recentWorkoutsData.workouts) {
      const d = new Date(w.completed_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      set.add(key);
    }
    return set;
  }, [recentWorkoutsData]);

  useEffect(() => {
    setSelectedDate(today);
    requestAnimationFrame(() => {
      const todayEl = dateStripRef.current?.querySelector('[data-today]') as HTMLElement | null;
      todayEl?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset forceListView when workout ends so next mobile workout starts in carousel mode
  useEffect(() => {
    if (!activeWorkout) setForceListView(false);
  }, [activeWorkout]);

  // If there's an active workout, show it
  if (activeWorkout) {
    if (isMobile && !forceListView) {
      return <MobileActiveWorkout onSwitchToList={() => setForceListView(true)} />;
    }
    return <ActiveWorkout />;
  }

  const getRetroISO = (): string | undefined => {
    if (isSameDay(selectedDate, today)) return undefined;
    const d = new Date(selectedDate);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };

  const scrollDateStrip = (direction: 'left' | 'right') => {
    dateStripRef.current?.scrollBy({
      left: direction === 'left' ? -168 : 168,
      behavior: 'smooth',
    });
  };

  const isToday = isSameDay(selectedDate, today);

  const handleStartWorkout = (name: string) => {
    startWorkout(name, getRetroISO());
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

      let previousData: Record<string, { reps: number[]; weight: number[]; rir?: (number | null)[] }> | undefined;
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
              rir: ex.rir ?? undefined,
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
        getRetroISO(),
      );
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleStartFromSplitSession = async (session: SessionResponse, splitId: string) => {
    setLoadingSessionId(session.id);
    try {
      const exercises = session.exercises.map((ex) => ({
        name: ex.exercise_name,
        sets: ex.sets,
        unilateral: ex.unilateral,
      }));

      let previousData: Record<string, { reps: number[]; weight: number[]; rir?: (number | null)[] }> | undefined;
      try {
        const history = await getWorkouts({ limit: 20, days: 90 });
        const previousWorkout = history.workouts.find(
          (w) => w.session_name === session.name
        );
        if (previousWorkout) {
          previousData = {};
          for (const ex of previousWorkout.exercises) {
            previousData[ex.exercise_name] = {
              reps: ex.reps,
              weight: ex.weight,
              rir: ex.rir ?? undefined,
            };
          }
        }
      } catch {
        // Non-critical
      }

      startWorkoutFromSession(
        session.name,
        exercises,
        previousData,
        session.id,
        splitId,
        undefined,
        getRetroISO(),
      );
    } finally {
      setLoadingSessionId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Date Strip */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => scrollDateStrip('left')}
          className="shrink-0 p-1 text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div
          ref={dateStripRef}
          className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide"
        >
          {dates.map((date) => {
            const selected = isSameDay(date, selectedDate);
            const dateIsToday = isSameDay(date, today);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const hasWorkout = workoutDates.has(dateKey);
            return (
              <button
                key={date.toISOString()}
                {...(dateIsToday ? { 'data-today': '' } : {})}
                onClick={() => setSelectedDate(date)}
                className={`shrink-0 w-14 h-16 flex flex-col items-center justify-center rounded-lg text-center transition-colors ${
                  selected
                    ? 'bg-crimson/10 text-crimson border border-crimson/30'
                    : 'text-secondary hover:bg-steel border border-transparent'
                }`}
              >
                <span className="text-[10px] leading-none">{dateIsToday ? 'Today' : DAY_ABBREVS[date.getDay()]}</span>
                <span className="text-base font-semibold leading-tight mt-0.5">{date.getDate()}</span>
                {(dateIsToday || hasWorkout) && (
                  <span className={`w-1 h-1 rounded-full mt-0.5 ${
                    hasWorkout ? 'bg-crimson' : selected ? 'bg-crimson' : 'bg-muted'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => scrollDateStrip('right')}
          className="shrink-0 p-1 text-muted hover:text-foreground transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Start Workout</h1>
        <p className="text-secondary">
          {isToday
            ? 'Choose a template or start fresh'
            : `Logging for ${selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
          }
        </p>
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

      {/* My Splits */}
      {splitsData && splitsData.splits.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted mb-3 flex items-center gap-1.5">
            <Layers size={14} />
            My Splits
          </h2>
          <div className="space-y-2">
            {splitsData.splits.map((split) => (
              <Card key={split.id} variant="interactive" className="p-0">
                <button
                  onClick={() => setExpandedSplitId(expandedSplitId === split.id ? null : split.id)}
                  className="w-full flex items-center justify-between p-3"
                >
                  <div className="text-left">
                    <h3 className="font-medium text-foreground">{split.name}</h3>
                    <p className="text-xs text-muted">{split.sessions.length} sessions</p>
                  </div>
                  {expandedSplitId === split.id ? (
                    <ChevronDown size={16} className="text-muted" />
                  ) : (
                    <ChevronRight size={16} className="text-muted" />
                  )}
                </button>
                {expandedSplitId === split.id && (
                  <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                    {split.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-steel transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{session.name}</p>
                          <p className="text-xs text-muted">{session.exercises.length} exercises</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleStartFromSplitSession(session, split.id)}
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
                    ))}
                  </div>
                )}
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
