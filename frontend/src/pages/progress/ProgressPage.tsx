import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Award, Calendar, Search, Activity, BarChart3, Flame } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Spinner } from '@/components/ui';
import { getWorkouts, workoutKeys } from '@/api/workouts.api';
import { analyzeWorkouts, analysisKeys } from '@/api/analysis.api';
import { calculate1RM, calculateEffectiveReps, formatDate } from '@/lib/utils';
import { searchExercises } from '@/data/exercises';
import { useSettingsStore, formatWeightWithUnit, convertWeight } from '@/stores/settingsStore';
import { MuscleChart, AnalysisSummary, SuggestionsList } from '@/components/analysis';
import { EffectiveRepsHeatmap } from './EffectiveRepsHeatmap';

type ProgressTab = 'analytics' | 'exercise';

const DAY_OPTIONS = [7, 14, 30] as const;

export function ProgressPage() {
  const units = useSettingsStore((s) => s.units);
  const [activeTab, setActiveTab] = useState<ProgressTab>('analytics');
  const [selectedExercise, setSelectedExercise] = useState('Bench Press');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [analysisDays, setAnalysisDays] = useState<number>(7);

  const { data: workoutsData, isLoading } = useQuery({
    queryKey: workoutKeys.list({ limit: 100 }),
    queryFn: () => getWorkouts({ limit: 100 }),
  });

  const { data: analysisData, isLoading: isAnalysisLoading } = useQuery({
    queryKey: analysisKeys.workouts(analysisDays),
    queryFn: () => analyzeWorkouts(analysisDays),
  });

  // Build heatmap data for selected exercise
  const heatmapData = useMemo(() => {
    if (!workoutsData?.workouts) return [];

    const points: Array<{
      date: string;
      dateFormatted: string;
      weight: number;
      reps: number;
      rir: number | null;
      effectiveReps: number | null;
      isRecent: boolean;
    }> = [];

    // Sort workouts by date descending to determine recency
    const sorted = [...workoutsData.workouts].sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );

    // Find indices of workouts containing this exercise to determine "recent" (last 3 sessions)
    const sessionIndices: number[] = [];
    sorted.forEach((workout, idx) => {
      if (workout.exercises.some((ex) => ex.exercise_name.toLowerCase() === selectedExercise.toLowerCase())) {
        sessionIndices.push(idx);
      }
    });
    const recentSessionSet = new Set(sessionIndices.slice(0, 3));

    sorted.forEach((workout, workoutIdx) => {
      for (const exercise of workout.exercises) {
        if (exercise.exercise_name.toLowerCase() !== selectedExercise.toLowerCase()) continue;

        const isRecent = recentSessionSet.has(workoutIdx);

        for (let i = 0; i < exercise.sets_completed; i++) {
          const reps = exercise.reps[i];
          const weight = exercise.weight[i];
          const rir = exercise.rir?.[i] ?? null;
          const effectiveReps = calculateEffectiveReps(reps, rir);

          if (reps > 0) {
            points.push({
              date: workout.completed_at,
              dateFormatted: formatDate(workout.completed_at),
              weight,
              reps,
              rir,
              effectiveReps,
              isRecent,
            });
          }
        }
      }
    });

    return points;
  }, [workoutsData, selectedExercise]);

  // Calculate PRs for exercise tab
  const prs = useMemo(() => {
    if (heatmapData.length === 0) return null;

    // Peak stimulus: highest effective reps value
    const effectiveValues = heatmapData
      .map((d) => d.effectiveReps)
      .filter((v): v is number => v !== null);
    const peakStimulus = effectiveValues.length > 0 ? Math.max(...effectiveValues) : null;

    // Max weight
    const maxWeight = Math.max(...heatmapData.map((d) => d.weight));
    const displayMaxWeight = units === 'metric' ? convertWeight(maxWeight, 'imperial', 'metric') : maxWeight;

    // Fallback Est. 1RM (used when no RIR data)
    let max1RM = 0;
    for (const point of heatmapData) {
      const est = calculate1RM(point.weight, point.reps);
      if (est > max1RM) max1RM = est;
    }
    const display1RM = units === 'metric' ? convertWeight(max1RM, 'imperial', 'metric') : max1RM;

    // Session count
    const uniqueDates = new Set(heatmapData.map((d) => d.date));

    return { peakStimulus, maxWeight: displayMaxWeight, max1RM: display1RM, sessions: uniqueDates.size };
  }, [heatmapData, units]);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    return searchExercises(searchQuery, 10);
  }, [searchQuery]);

  // Get unique exercises from workout history
  const exercisesInHistory = useMemo(() => {
    if (!workoutsData?.workouts) return new Set<string>();
    const exercises = new Set<string>();
    for (const workout of workoutsData.workouts) {
      for (const exercise of workout.exercises) {
        exercises.add(exercise.exercise_name);
      }
    }
    return exercises;
  }, [workoutsData]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Progress</h1>
        <p className="text-secondary">Track your strength gains over time</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-steel rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'bg-crimson text-white'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('exercise')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === 'exercise'
              ? 'bg-crimson text-white'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Exercise
        </button>
      </div>

      {/* ============================================ */}
      {/* Analytics Tab                                */}
      {/* ============================================ */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-crimson" />
              <h2 className="text-lg font-semibold text-foreground">Training Analytics</h2>
            </div>
            <div className="flex gap-1 bg-steel rounded-lg p-1">
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAnalysisDays(d)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    analysisDays === d
                      ? 'bg-crimson text-white'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {isAnalysisLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !analysisData || analysisData.muscles.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Activity className="w-10 h-10 mx-auto mb-3 text-muted" />
                <h3 className="font-medium text-foreground mb-1">No workouts in the last {analysisDays} days</h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  Log some workouts to see your muscle stimulus analysis here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <AnalysisSummary summary={analysisData.summary} muscles={analysisData.muscles} />
              <Card>
                <CardHeader>
                  <CardTitle>Muscle Stimulus ({analysisDays}-Day Window)</CardTitle>
                </CardHeader>
                <CardContent>
                  <MuscleChart muscles={analysisData.muscles} height={400} proportionalColors />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Suggestions */}
          {analysisData && analysisData.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Optimization Suggestions</CardTitle>
              </CardHeader>
              <CardContent>
                <SuggestionsList suggestions={analysisData.suggestions} maxItems={5} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* Exercise Tab                                 */}
      {/* ============================================ */}
      {activeTab === 'exercise' && (
        <div className="space-y-4">
          {/* Exercise selector header */}
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-foreground">Exercise Progress</h2>
          </div>

          {/* Exercise Selector */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={showSearch ? searchQuery : selectedExercise}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearch(true);
                    }}
                    onFocus={() => setShowSearch(true)}
                    placeholder="Search exercises..."
                    className="w-full bg-charcoal border border-white/10 rounded-md pl-10 pr-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
                  />
                  {showSearch && searchResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-charcoal border border-white/10 rounded-md shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                      {searchResults.map((exercise) => (
                        <button
                          key={exercise.name}
                          onClick={() => {
                            setSelectedExercise(exercise.name);
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-secondary hover:bg-steel hover:text-foreground transition-colors flex items-center justify-between"
                        >
                          <span>{exercise.name}</span>
                          {exercisesInHistory.has(exercise.name) && (
                            <span className="text-xs text-crimson">Has data</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : heatmapData.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted" />
                <h3 className="font-medium text-foreground mb-2">No Data for {selectedExercise}</h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  Start logging workouts with this exercise to see your progress over time.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* PR Cards */}
              {prs && (
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      {prs.peakStimulus !== null ? (
                        <>
                          <Flame className="w-6 h-6 mx-auto mb-2 text-crimson" />
                          <p className="text-2xl font-bold text-foreground">
                            {prs.peakStimulus}
                          </p>
                          <p className="text-xs text-muted">Peak Stimulus</p>
                        </>
                      ) : (
                        <>
                          <Award className="w-6 h-6 mx-auto mb-2 text-crimson" />
                          <p className="text-2xl font-bold text-foreground">
                            {formatWeightWithUnit(prs.max1RM, units)}
                          </p>
                          <p className="text-xs text-muted">Est. 1RM</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <TrendingUp className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                      <p className="text-2xl font-bold text-foreground">
                        {formatWeightWithUnit(prs.maxWeight, units)}
                      </p>
                      <p className="text-xs text-muted">Max Weight</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <Calendar className="w-6 h-6 mx-auto mb-2 text-green-400" />
                      <p className="text-2xl font-bold text-foreground">
                        {prs.sessions}
                      </p>
                      <p className="text-xs text-muted">Sessions</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Effective Reps Heatmap */}
              <EffectiveRepsHeatmap data={heatmapData} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
