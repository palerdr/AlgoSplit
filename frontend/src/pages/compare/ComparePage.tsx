import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitCompareArrows,
  Loader2,
  Save,
  Check,
  X,
  BarChart3,
  Radar,
  Table2,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
  MuscleChart,
  AnalysisSummary,
  SuggestionsList,
  StimulusBreakdown,
} from '@/components/analysis';
import { getSplits, splitKeys, analyzeSplit as analyzeSavedSplit } from '@/api/splits.api';
import {
  getComparisons,
  getComparison,
  createComparison,
  updateComparison,
  comparisonKeys,
} from '@/api/comparisons.api';
import { useCompareStore } from '@/stores/compareStore';
import { cn } from '@/lib/utils';
import type { AnalysisResponse } from '@/types/api.types';

const SPLIT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const SPLIT_COLOR_CLASSES = [
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
];

type CompareView = 'summary' | 'muscles' | 'radar' | 'detail';

export function ComparePage() {
  const { id: comparisonId } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();

  const {
    selectedSplitIds,
    analysisResults,
    comparisonName,
    loadedComparisonId,
  } = useCompareStore(useShallow((state) => ({
    selectedSplitIds: state.selectedSplitIds,
    analysisResults: state.analysisResults,
    comparisonName: state.comparisonName,
    loadedComparisonId: state.loadedComparisonId,
  })));

  const setSelectedSplitIds = useCompareStore((s) => s.setSelectedSplitIds);
  const toggleSplitId = useCompareStore((s) => s.toggleSplitId);
  const setAnalysisResult = useCompareStore((s) => s.setAnalysisResult);
  const setComparisonName = useCompareStore((s) => s.setComparisonName);
  const setLoadedComparisonId = useCompareStore((s) => s.setLoadedComparisonId);
  const reset = useCompareStore((s) => s.reset);

  const [activeView, setActiveView] = useState<CompareView>('summary');
  const [detailSplitIndex, setDetailSplitIndex] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch user's saved splits
  const { data: savedSplits } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  // Fetch saved comparisons
  const { data: savedComparisons } = useQuery({
    queryKey: comparisonKeys.list(),
    queryFn: getComparisons,
  });

  // Load comparison if URL has ID
  useQuery({
    queryKey: comparisonKeys.detail(comparisonId ?? ''),
    queryFn: () => getComparison(comparisonId!),
    enabled: !!comparisonId && comparisonId !== loadedComparisonId,
    select: (data) => {
      setLoadedComparisonId(data.id);
      setComparisonName(data.name);
      setSelectedSplitIds(data.split_ids);
      return data;
    },
  });

  // Save comparison mutation
  const saveMutation = useMutation({
    mutationFn: () => {
      const data = { name: comparisonName || 'Untitled Comparison', split_ids: selectedSplitIds };
      if (loadedComparisonId) {
        return updateComparison(loadedComparisonId, data);
      }
      return createComparison(data);
    },
    onSuccess: (data) => {
      if (!loadedComparisonId) {
        setLoadedComparisonId(data.id);
      }
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  // Run analysis for all selected splits
  async function runComparison() {
    if (selectedSplitIds.length < 2) return;
    setAnalyzing(true);
    try {
      const promises = selectedSplitIds.map((id) => analyzeSavedSplit(id));
      const results = await Promise.all(promises);
      results.forEach((result, i) => {
        setAnalysisResult(selectedSplitIds[i], result);
      });
    } catch (err) {
      console.error('Comparison analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  }

  // Load a saved comparison
  function loadComparison(compId: string) {
    const comp = savedComparisons?.comparisons.find((c) => c.id === compId);
    if (!comp) return;
    setLoadedComparisonId(comp.id);
    setComparisonName(comp.name);
    setSelectedSplitIds(comp.split_ids);
  }

  // Get split name by id
  function getSplitName(splitId: string): string {
    return savedSplits?.splits.find((s) => s.id === splitId)?.name || 'Unknown';
  }

  // Check if we have results for all selected splits
  const hasResults = selectedSplitIds.length >= 2 &&
    selectedSplitIds.every((id) => analysisResults[id]);

  const activeResults = selectedSplitIds
    .map((id) => ({ id, name: getSplitName(id), result: analysisResults[id] }))
    .filter((r) => r.result);

  return (
    <div className="min-h-screen pb-20">
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-crimson" />
            Compare Splits
          </h1>
          <p className="text-sm text-muted mt-1">
            Analyze 2-4 splits side by side to find the best program for your goals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  {loadedComparisonId ? 'Update' : 'Save'}
                </>
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      {/* Setup section */}
      <Card>
        <CardHeader>
          <CardTitle>Select Splits to Compare</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Comparison name */}
            <input
              type="text"
              value={comparisonName}
              onChange={(e) => setComparisonName(e.target.value)}
              placeholder="Comparison name (optional)"
              className="w-full bg-steel border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
            />

            {/* Split selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary">
                  Select 2-4 splits ({selectedSplitIds.length} selected)
                </span>
                {(savedComparisons?.comparisons.length ?? 0) > 0 && (
                  <select
                    onChange={(e) => e.target.value && loadComparison(e.target.value)}
                    className="bg-steel border border-white/10 rounded px-2 py-1 text-xs text-foreground"
                    defaultValue=""
                  >
                    <option value="">Load saved...</option>
                    {savedComparisons?.comparisons.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedSplits?.splits.map((split) => {
                  const isSelected = selectedSplitIds.includes(split.id);
                  const selectionIndex = selectedSplitIds.indexOf(split.id);

                  return (
                    <button
                      key={split.id}
                      onClick={() => toggleSplitId(split.id)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors text-left',
                        isSelected
                          ? SPLIT_COLOR_CLASSES[selectionIndex] || SPLIT_COLOR_CLASSES[0]
                          : 'border-white/10 text-muted hover:border-white/20 hover:text-foreground'
                      )}
                    >
                      <div>
                        <span className="font-medium">{split.name}</span>
                        <span className="text-xs ml-2 opacity-60">
                          {split.sessions.length} sessions
                        </span>
                      </div>
                      {isSelected && <X className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compare button */}
            <Button
              onClick={runComparison}
              disabled={selectedSplitIds.length < 2 || analyzing}
              className="w-full"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing {selectedSplitIds.length} splits...
                </>
              ) : (
                <>
                  <GitCompareArrows className="w-4 h-4 mr-2" />
                  Compare ({selectedSplitIds.length} splits)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results section */}
      {hasResults && (
        <>
          {/* Selected splits pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeResults.map((r, i) => (
              <span
                key={r.id}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border',
                  SPLIT_COLOR_CLASSES[i]
                )}
              >
                {r.name}
              </span>
            ))}
          </div>

          {/* View switcher */}
          <div className="inline-flex rounded-lg bg-steel/50 p-0.5">
            {([
              { key: 'summary' as const, icon: Table2, label: 'Summary' },
              { key: 'muscles' as const, icon: BarChart3, label: 'Muscles' },
              { key: 'radar' as const, icon: Radar, label: 'Radar' },
              { key: 'detail' as const, icon: Layers, label: 'Detail' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeView === tab.key
                    ? 'bg-crimson/20 text-crimson'
                    : 'text-muted hover:text-foreground'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* View content */}
          {activeView === 'summary' && (
            <SummaryTable splits={activeResults} />
          )}
          {activeView === 'muscles' && (
            <MuscleComparisonChart splits={activeResults} />
          )}
          {activeView === 'radar' && (
            <RadarComparisonChart splits={activeResults} />
          )}
          {activeView === 'detail' && (
            <DetailView
              splits={activeResults}
              activeIndex={detailSplitIndex}
              setActiveIndex={setDetailSplitIndex}
            />
          )}
        </>
      )}
    </div>
    </div>
  );
}

// ============================================
// Summary Table
// ============================================

function SummaryTable({
  splits,
}: {
  splits: Array<{ id: string; name: string; result: AnalysisResponse }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-muted font-medium">Metric</th>
                {splits.map((s, i) => (
                  <th key={s.id} className="text-right py-2 px-4">
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full border',
                        SPLIT_COLOR_CLASSES[i]
                      )}
                    >
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <MetricRow
                label="Total Sets"
                values={splits.map((s) => s.result.summary.total_sets)}
                format="int"
                higherIsBetter={null}
              />
              <MetricRow
                label="Muscles Trained"
                values={splits.map((s) => s.result.summary.muscles_trained)}
                format="int"
                higherIsBetter={true}
              />
              <MetricRow
                label="Avg Net Stimulus"
                values={splits.map((s) => s.result.summary.avg_net_stimulus)}
                format="decimal"
                higherIsBetter={true}
              />
              <MetricRow
                label="Avg Sets/Muscle"
                values={splits.map((s) => s.result.summary.avg_sets_per_muscle)}
                format="decimal"
                higherIsBetter={null}
              />
              <MetricRow
                label="Cycle Length"
                values={splits.map((s) => s.result.cycle_length)}
                format="int"
                suffix=" days"
                higherIsBetter={null}
              />
              <MetricRow
                label="Suggestions"
                values={splits.map((s) => s.result.suggestions.length)}
                format="int"
                higherIsBetter={false}
              />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({
  label,
  values,
  format,
  suffix = '',
  higherIsBetter,
}: {
  label: string;
  values: number[];
  format: 'int' | 'decimal';
  suffix?: string;
  higherIsBetter: boolean | null;
}) {
  const bestIndex = higherIsBetter !== null
    ? values.indexOf(higherIsBetter ? Math.max(...values) : Math.min(...values))
    : -1;

  return (
    <tr>
      <td className="py-2 text-secondary">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            'text-right py-2 px-4 font-mono',
            i === bestIndex ? 'text-green-400 font-medium' : 'text-foreground'
          )}
        >
          {format === 'int' ? v : v.toFixed(1)}
          {suffix}
          {i === bestIndex && higherIsBetter !== null && (
            <span className="text-green-400 text-xs ml-1">*</span>
          )}
        </td>
      ))}
    </tr>
  );
}

// ============================================
// Muscle Comparison Chart
// ============================================

const COMPARE_INITIAL_VISIBLE = 12;

function MuscleComparisonChart({
  splits,
}: {
  splits: Array<{ id: string; name: string; result: AnalysisResponse }>;
}) {
  const [showAll, setShowAll] = useState(false);

  const allChartData = useMemo(() => {
    // Get all unique muscles
    const muscleMap = new Map<string, Record<string, number | string>>();

    for (const split of splits) {
      for (const muscle of split.result.muscles) {
        if (!muscleMap.has(muscle.region_id)) {
          muscleMap.set(muscle.region_id, {
            name: abbreviateMuscleName(muscle.display_name),
          });
        }
        const entry = muscleMap.get(muscle.region_id)!;
        entry[split.id] = muscle.net_stimulus;
      }
    }

    return Array.from(muscleMap.values())
      .sort((a, b) => {
        // Sort by max stimulus across splits
        const maxA = Math.max(...splits.map((s) => (a[s.id] as number) || 0));
        const maxB = Math.max(...splits.map((s) => (b[s.id] as number) || 0));
        return maxB - maxA;
      })
      .filter((row) => splits.some((s) => (row[s.id] as number) > 0));
  }, [splits]);

  const canTruncate = allChartData.length > COMPARE_INITIAL_VISIBLE;
  const chartData = canTruncate && !showAll
    ? allChartData.slice(0, COMPARE_INITIAL_VISIBLE)
    : allChartData;
  const chartHeight = Math.max(400, chartData.length * 36);
  const fadeKey = `${chartData.length}-${showAll}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle Stimulus Overlay</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="chart-fade-in" key={fadeKey}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#E5E7EB', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: '#E5E7EB', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#E5E7EB' }}
                formatter={((value: number) => value.toFixed(1)) as any}
              />
              <Legend />
              {splits.map((split, i) => (
                <Bar
                  key={split.id}
                  dataKey={split.id}
                  name={split.name}
                  fill={SPLIT_COLORS[i]}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={16}
                  background={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {canTruncate && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs text-secondary hover:text-foreground transition-colors px-3 py-1.5 rounded border border-white/8 hover:border-white/15"
          >
            {showAll ? `Show Top ${COMPARE_INITIAL_VISIBLE}` : `Show All ${allChartData.length} Muscles`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Radar Comparison Chart
// ============================================

// Abbreviate long muscle display names for chart labels
const MUSCLE_ABBREV: Record<string, string> = {
  'Mid-Lower Chest': 'ML Chest',
  'Upper Chest': 'Upper Chest',
  'Front Delt': 'Front Delt',
  'Side Delt': 'Side Delt',
  'Rear Delt': 'Rear Delt',
  'Thoracic Lats': 'Upper Lats',
  'Iliac Lats': 'Lower Lats',
  'Triceps Long Head': 'Tri Long',
  'Triceps Lat/Med': 'Tri Lat/Med',
  'Biceps Brachii': 'Biceps',
  'Brachioradialis': 'Brachiorad',
  'Wrist Flexors': 'Wrist Flex',
  'Wrist Extensors': 'Wrist Ext',
  'Rectus Femoris': 'Rec Fem',
  'Hip Extensors': 'Hip Ext',
  'Knee Flexors': 'Knee Flex',
  'Glute Med/Min': 'Glute M/M',
  'Spinal Erectors': 'Spinal Erec',
  'Hip Adductors': 'Adductors',
  'Anterior Core': 'Ant Core',
  'Lateral Core': 'Lat Core',
  'Deep Core': 'Deep Core',
};

function abbreviateMuscleName(name: string): string {
  return MUSCLE_ABBREV[name] || name;
}

// Abbreviate group names for compact radar labels
const GROUP_LABELS: Record<string, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  upper_back: 'Upper Back',
  lower_back: 'Low Back',
  lats: 'Lats',
  elbow_flexors: 'Elbow Flex',
  forearms: 'Forearms',
  triceps: 'Triceps',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hams',
  calves: 'Calves',
  adductors: 'Adductors',
  abs: 'Abs',
};

function RadarComparisonChart({
  splits,
}: {
  splits: Array<{ id: string; name: string; result: AnalysisResponse }>;
}) {
  const radarData = useMemo(() => {
    // Aggregate by muscle group — collect from all splits
    const groupMap = new Map<string, Record<string, number | string>>();

    for (const split of splits) {
      for (const group of split.result.group_summaries) {
        if (!groupMap.has(group.group)) {
          groupMap.set(group.group, {
            group: GROUP_LABELS[group.group] || group.group.replace(/_/g, ' '),
          });
        }
        const entry = groupMap.get(group.group)!;
        entry[split.id] = group.total_net_stimulus;
      }
    }

    // Ensure every group has a 0 for splits that don't train it
    for (const entry of groupMap.values()) {
      for (const split of splits) {
        if (entry[split.id] === undefined) {
          entry[split.id] = 0;
        }
      }
    }

    return Array.from(groupMap.values());
  }, [splits]);

  // Find max value for radar scale
  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of radarData) {
      for (const split of splits) {
        const val = (row[split.id] as number) || 0;
        if (val > max) max = val;
      }
    }
    return Math.ceil(max);
  }, [radarData, splits]);

  const radarFadeKey = splits.map(s => s.id).join(',');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle Group Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="chart-fade-in flex justify-center" key={radarFadeKey}>
          <ResponsiveContainer width="100%" height={500}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis
                dataKey="group"
                tick={{ fill: '#E5E7EB', fontSize: 11 }}
              />
              <PolarRadiusAxis
                domain={[0, maxValue]}
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#E5E7EB' }}
                formatter={((value: number) => value.toFixed(1)) as any}
              />
              <Legend />
              {splits.map((split, i) => (
                <RechartsRadar
                  key={split.id}
                  name={split.name}
                  dataKey={split.id}
                  stroke={SPLIT_COLORS[i]}
                  fill={SPLIT_COLORS[i]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Per-Split Detail View
// ============================================

function DetailView({
  splits,
  activeIndex,
  setActiveIndex,
}: {
  splits: Array<{ id: string; name: string; result: AnalysisResponse }>;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  const activeSplit = splits[activeIndex];
  if (!activeSplit) return null;

  return (
    <div className="space-y-4">
      {/* Split selector tabs */}
      <div className="inline-flex rounded-lg bg-steel/50 p-0.5">
        {splits.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActiveIndex(i)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              i === activeIndex
                ? SPLIT_COLOR_CLASSES[i]
                : 'text-muted hover:text-foreground'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Full analysis for the active split */}
      <AnalysisSummary
        summary={activeSplit.result.summary}
        muscles={activeSplit.result.muscles}
      />

      <Card>
        <CardHeader>
          <CardTitle>Muscle Stimulus</CardTitle>
        </CardHeader>
        <CardContent>
          <MuscleChart muscles={activeSplit.result.muscles} />
        </CardContent>
      </Card>

      {activeSplit.result.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <SuggestionsList suggestions={activeSplit.result.suggestions} maxItems={5} />
          </CardContent>
        </Card>
      )}

      {activeSplit.result.session_breakdowns && activeSplit.result.session_breakdowns.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <StimulusBreakdown sessionBreakdowns={activeSplit.result.session_breakdowns} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
