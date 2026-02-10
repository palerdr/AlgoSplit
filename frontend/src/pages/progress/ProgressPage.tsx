import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Award, Calendar, Search, Activity, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Spinner } from '@/components/ui';
import { getWorkouts, workoutKeys } from '@/api/workouts.api';
import { analyzeWorkouts, analysisKeys } from '@/api/analysis.api';
import { calculate1RM, formatDate } from '@/lib/utils';
import { searchExercises } from '@/data/exercises';
import { useSettingsStore, formatWeightWithUnit, convertWeight } from '@/stores/settingsStore';
import { MuscleChart, AnalysisSummary, SuggestionsList } from '@/components/analysis';

interface ChartDataPoint {
  date: string;
  dateFormatted: string;
  maxWeight: number;
  maxReps: number;
  estimated1RM: number;
  totalVolume: number;
  sets: number;
}

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  const units = useSettingsStore((s) => s.units);
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as ChartDataPoint;

  return (
    <div className="bg-charcoal border border-white/10 rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground">{data.dateFormatted}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Max Weight:</span>
          <span className="text-foreground">{formatWeightWithUnit(data.maxWeight, units)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Est. 1RM:</span>
          <span className="text-crimson font-medium">{formatWeightWithUnit(data.estimated1RM, units)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Volume:</span>
          <span className="text-foreground">{formatWeightWithUnit(data.totalVolume, units)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Sets:</span>
          <span className="text-foreground">{data.sets}</span>
        </div>
      </div>
    </div>
  );
}

const DAY_OPTIONS = [7, 14, 30] as const;

export function ProgressPage() {
  const units = useSettingsStore((s) => s.units);
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

  // Filter workouts for selected exercise and build chart data
  const chartData = useMemo(() => {
    if (!workoutsData?.workouts) return [];

    const exerciseWorkouts: ChartDataPoint[] = [];

    for (const workout of workoutsData.workouts) {
      for (const exercise of workout.exercises) {
        if (exercise.exercise_name.toLowerCase() === selectedExercise.toLowerCase()) {
          // Find max weight and corresponding reps
          let maxWeight = 0;
          let maxReps = 0;
          for (let i = 0; i < exercise.weight.length; i++) {
            if (exercise.weight[i] > maxWeight) {
              maxWeight = exercise.weight[i];
              maxReps = exercise.reps[i];
            }
          }

          // Calculate total volume
          const totalVolume = exercise.weight.reduce(
            (sum, w, i) => sum + w * exercise.reps[i],
            0
          );

          // Convert weights if needed
          const displayMaxWeight = units === 'metric' ? convertWeight(maxWeight, 'imperial', 'metric') : maxWeight;
          const displayVolume = units === 'metric' ? convertWeight(totalVolume, 'imperial', 'metric') : totalVolume;
          const display1RM = units === 'metric'
            ? convertWeight(calculate1RM(maxWeight, maxReps), 'imperial', 'metric')
            : calculate1RM(maxWeight, maxReps);

          exerciseWorkouts.push({
            date: workout.completed_at,
            dateFormatted: formatDate(workout.completed_at),
            maxWeight: displayMaxWeight,
            maxReps,
            estimated1RM: display1RM,
            totalVolume: Math.round(displayVolume),
            sets: exercise.sets_completed,
          });
        }
      }
    }

    // Sort by date ascending
    return exerciseWorkouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [workoutsData, selectedExercise, units]);

  // Calculate PRs
  const prs = useMemo(() => {
    if (chartData.length === 0) return null;

    const max1RM = Math.max(...chartData.map(d => d.estimated1RM));
    const maxWeight = Math.max(...chartData.map(d => d.maxWeight));
    const maxVolume = Math.max(...chartData.map(d => d.totalVolume));

    return { max1RM, maxWeight, maxVolume };
  }, [chartData]);

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

      {/* Training Analytics Section */}
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
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Exercise Progress Section Header */}
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
      ) : chartData.length === 0 ? (
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
                  <Award className="w-6 h-6 mx-auto mb-2 text-crimson" />
                  <p className="text-2xl font-bold text-foreground">
                    {formatWeightWithUnit(prs.max1RM, units)}
                  </p>
                  <p className="text-xs text-muted">Est. 1RM</p>
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
                    {chartData.length}
                  </p>
                  <p className="text-xs text-muted">Sessions</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Weight Progress Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Estimated 1RM Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="chart-fade-in" key={`1rm-${selectedExercise}-${chartData.length}`}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="dateFormatted"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip content={<ProgressTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="estimated1RM"
                      stroke="#DC2626"
                      strokeWidth={2}
                      dot={{ fill: '#DC2626', r: 4 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Volume Progress Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Volume Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="chart-fade-in" key={`vol-${selectedExercise}-${chartData.length}`}>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="dateFormatted"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip content={<ProgressTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="totalVolume"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={{ fill: '#3B82F6', r: 4 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Suggestions at the very bottom */}
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
  );
}
