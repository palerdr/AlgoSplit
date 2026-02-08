import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Dumbbell, TrendingUp, Target, Clock, BarChart3, ArrowRight, Play, Loader2, Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Spinner } from '@/components/ui';
import { getWorkoutStats, workoutKeys, getWorkouts } from '@/api/workouts.api';
import { getSplits, splitKeys, analyzeSplit as analyzeSplitById } from '@/api/splits.api';
import { getTodaySessions, getProgramSessionExercises, programKeys } from '@/api/programs.api';
import { useWorkoutStore } from '@/features/workout/workoutStore';
import { formatDate, getRelativeTime } from '@/lib/utils';
import { MiniMuscleChart, CompactSummary, SuggestionsSummary } from '@/components/analysis';
import type { TodaySessionItem } from '@/types/api.types';

function formatTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { startWorkoutFromSession } = useWorkoutStore();
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const todayDate = formatTodayDate();

  const { data: todaySessions } = useQuery({
    queryKey: programKeys.todaySessions(todayDate),
    queryFn: () => getTodaySessions(todayDate),
  });

  const handleStartFromProgramSession = async (session: TodaySessionItem) => {
    setLoadingSessionId(session.id);
    try {
      // Resolve exercises
      const resolved = await getProgramSessionExercises(session.program_id, session.id);
      const exercises = resolved.exercises.map((ex) => ({
        name: ex.exercise_name,
        sets: ex.sets,
        unilateral: ex.unilateral,
      }));

      // Fetch previous workout data for this session name
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
      navigate('/workout');
    } finally {
      setLoadingSessionId(null);
    }
  };

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: workoutKeys.stats(30),
    queryFn: () => getWorkoutStats(30),
  });

  const { data: recentWorkouts, isLoading: workoutsLoading } = useQuery({
    queryKey: workoutKeys.list({ limit: 5 }),
    queryFn: () => getWorkouts({ limit: 5 }),
  });

  const { data: splits } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  // Get the first split as "active" and auto-analyze it
  const activeSplit = splits?.splits?.[0];
  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: splitKeys.analysis(activeSplit?.id ?? ''),
    queryFn: () => analyzeSplitById(activeSplit!.id),
    enabled: !!activeSplit?.id,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-secondary">Track your training progress</p>
        </div>
        <Link to="/workout">
          <Button>
            <Dumbbell className="mr-2 h-4 w-4" />
            Start Workout
          </Button>
        </Link>
      </div>

      {/* Today's Sessions */}
      {todaySessions && todaySessions.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-crimson" />
              <CardTitle>Today's Sessions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todaySessions.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-steel rounded-md"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {session.display_name}
                    </p>
                    <p className="text-xs text-muted">
                      {session.program_name}
                    </p>
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stimulus Overview - Only show if user has a split */}
      {activeSplit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-crimson" />
                <CardTitle>Stimulus Overview</CardTitle>
              </div>
              <Link
                to={`/analysis`}
                className="text-sm text-crimson hover:text-crimson-hover flex items-center gap-1"
              >
                View Analysis <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {analysisLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : analysisData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <CompactSummary
                    avgStimulus={analysisData.summary.avg_net_stimulus}
                    musclesTrained={analysisData.summary.muscles_trained}
                    totalMuscles={analysisData.summary.total_muscles}
                  />
                  <SuggestionsSummary suggestions={analysisData.suggestions} />
                </div>
                <MiniMuscleChart muscles={analysisData.muscles} />
                <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-white/5">
                  <span>Based on: <span className="text-foreground">{activeSplit.name}</span></span>
                  <span>{activeSplit.sessions.length} sessions</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted">
                Unable to analyze split
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-crimson/10 rounded-md">
                <Dumbbell className="h-5 w-5 text-crimson" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {statsLoading ? '-' : stats?.total_workouts ?? 0}
                </p>
                <p className="text-xs text-muted">Workouts (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-crimson/10 rounded-md">
                <Target className="h-5 w-5 text-crimson" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {statsLoading ? '-' : stats?.total_sets ?? 0}
                </p>
                <p className="text-xs text-muted">Total Sets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-crimson/10 rounded-md">
                <TrendingUp className="h-5 w-5 text-crimson" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {statsLoading
                    ? '-'
                    : Math.round((stats?.total_volume_pounds ?? 0) / 1000)}
                  <span className="text-sm font-normal text-muted">k</span>
                </p>
                <p className="text-xs text-muted">Volume (lbs)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-crimson/10 rounded-md">
                <Clock className="h-5 w-5 text-crimson" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {statsLoading
                    ? '-'
                    : Math.round(stats?.average_duration_minutes ?? 0)}
                  <span className="text-sm font-normal text-muted">m</span>
                </p>
                <p className="text-xs text-muted">Avg Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Workouts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Workouts</CardTitle>
              <Link
                to="/history"
                className="text-sm text-crimson hover:text-crimson-hover"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {workoutsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : recentWorkouts?.workouts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted">No workouts yet</p>
                <Link to="/workout">
                  <Button variant="ghost" className="mt-2">
                    Start your first workout
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentWorkouts?.workouts.map((workout) => (
                  <Link
                    key={workout.id}
                    to={`/history/${workout.id}`}
                    className="block p-3 -mx-1 rounded-md hover:bg-steel transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {workout.session_name}
                        </p>
                        <p className="text-xs text-muted">
                          {workout.exercises.length} exercises
                          {workout.duration_minutes &&
                            ` · ${workout.duration_minutes}m`}
                        </p>
                      </div>
                      <span className="text-xs text-muted">
                        {getRelativeTime(workout.completed_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Splits */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Splits</CardTitle>
              <Link
                to="/splits"
                className="text-sm text-crimson hover:text-crimson-hover"
              >
                Manage
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {splits?.splits.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted">No splits created</p>
                <Link to="/splits/new">
                  <Button variant="ghost" className="mt-2">
                    Create your first split
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {splits?.splits.slice(0, 3).map((split) => (
                  <Link
                    key={split.id}
                    to={`/splits/${split.id}`}
                    className="block p-3 -mx-1 rounded-md hover:bg-steel transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {split.name}
                        </p>
                        <p className="text-xs text-muted">
                          {split.sessions.length} sessions
                        </p>
                      </div>
                      <span className="text-xs text-muted">
                        {formatDate(split.updated_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Most Frequent Exercises */}
      {stats?.most_frequent_exercises && stats.most_frequent_exercises.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Exercises (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.most_frequent_exercises.slice(0, 8).map((ex) => (
                <div
                  key={ex.exercise}
                  className="px-3 py-1.5 bg-steel rounded-md text-sm"
                >
                  <span className="text-foreground">{ex.exercise}</span>
                  <span className="text-muted ml-2">{ex.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
