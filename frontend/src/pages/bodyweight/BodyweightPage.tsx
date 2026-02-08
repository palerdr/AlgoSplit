import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Scale, TrendingDown, TrendingUp, Calendar, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useSettingsStore, formatWeightWithUnit, convertWeight } from '@/stores/settingsStore';
import { storage } from '@/lib/utils';

interface WeightEntry {
  date: string;
  weight: number; // Always stored in lbs
}

const STORAGE_KEY = 'algosplit-bodyweight';

function loadWeightHistory(): WeightEntry[] {
  return storage.get<WeightEntry[]>(STORAGE_KEY) || [];
}

function saveWeightHistory(entries: WeightEntry[]): void {
  storage.set(STORAGE_KEY, entries);
}

interface ChartDataPoint {
  date: string;
  dateFormatted: string;
  weight: number;
}

function WeightTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  const units = useSettingsStore((s) => s.units);
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as ChartDataPoint;

  return (
    <div className="bg-charcoal border border-white/10 rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground">{data.dateFormatted}</p>
      <p className="text-crimson text-lg font-bold mt-1">
        {formatWeightWithUnit(data.weight, units)}
      </p>
    </div>
  );
}

export function BodyweightPage() {
  const units = useSettingsStore((s) => s.units);
  const [entries, setEntries] = useState<WeightEntry[]>(() => loadWeightHistory());
  const [inputWeight, setInputWeight] = useState('');

  function addEntry() {
    const weightValue = parseFloat(inputWeight);
    if (isNaN(weightValue) || weightValue <= 0) return;

    // Convert to lbs if user is in metric mode
    const weightInLbs = units === 'metric'
      ? convertWeight(weightValue, 'metric', 'imperial')
      : weightValue;

    const newEntry: WeightEntry = {
      date: new Date().toISOString(),
      weight: weightInLbs,
    };

    const newEntries = [...entries, newEntry].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setEntries(newEntries);
    saveWeightHistory(newEntries);
    setInputWeight('');
  }

  const chartData = useMemo<ChartDataPoint[]>(() => {
    return entries.map((entry) => ({
      date: entry.date,
      dateFormatted: formatDate(entry.date),
      weight: units === 'metric'
        ? convertWeight(entry.weight, 'imperial', 'metric')
        : entry.weight,
    }));
  }, [entries, units]);

  // Calculate stats
  const stats = useMemo(() => {
    if (entries.length === 0) return null;

    const weights = entries.map((e) =>
      units === 'metric' ? convertWeight(e.weight, 'imperial', 'metric') : e.weight
    );

    const current = weights[weights.length - 1];
    const starting = weights[0];
    const change = current - starting;
    const min = Math.min(...weights);
    const max = Math.max(...weights);

    // Calculate 7-day average
    const last7 = weights.slice(-7);
    const avg7Day = last7.reduce((a, b) => a + b, 0) / last7.length;

    return {
      current,
      starting,
      change,
      min,
      max,
      avg7Day,
    };
  }, [entries, units]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bodyweight</h1>
        <p className="text-secondary">Track your weight over time</p>
      </div>

      {/* Log Weight Card */}
      <Card>
        <CardHeader>
          <CardTitle>Log Today's Weight</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="number"
                value={inputWeight}
                onChange={(e) => setInputWeight(e.target.value)}
                placeholder={`Weight in ${units === 'imperial' ? 'lbs' : 'kg'}`}
                className="w-full bg-charcoal border border-white/10 rounded-md pl-10 pr-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
                onKeyDown={(e) => e.key === 'Enter' && addEntry()}
              />
            </div>
            <Button onClick={addEntry} disabled={!inputWeight}>
              <Plus className="w-4 h-4 mr-1" />
              Log Weight
            </Button>
          </div>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="w-12 h-12 mx-auto mb-3 text-muted" />
            <h3 className="font-medium text-foreground mb-2">No Weight Entries Yet</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">
              Start logging your weight to see your progress over time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <Scale className="w-5 h-5 mx-auto mb-1 text-crimson" />
                  <p className="text-xl font-bold text-foreground">
                    {formatWeightWithUnit(stats.current, units)}
                  </p>
                  <p className="text-xs text-muted">Current</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  {stats.change < 0 ? (
                    <TrendingDown className="w-5 h-5 mx-auto mb-1 text-green-400" />
                  ) : (
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                  )}
                  <p className="text-xl font-bold text-foreground">
                    {stats.change > 0 ? '+' : ''}{stats.change.toFixed(1)} {units === 'imperial' ? 'lbs' : 'kg'}
                  </p>
                  <p className="text-xs text-muted">Total Change</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <Calendar className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                  <p className="text-xl font-bold text-foreground">
                    {formatWeightWithUnit(stats.avg7Day, units)}
                  </p>
                  <p className="text-xs text-muted">7-Day Avg</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xl font-bold text-foreground">
                    {entries.length}
                  </p>
                  <p className="text-xs text-muted">Entries</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Weight Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Weight Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="chart-fade-in" key={`bw-${chartData.length}`}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <XAxis
                      dataKey="dateFormatted"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['dataMin - 5', 'dataMax + 5']}
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<WeightTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="weight"
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

          {/* Recent Entries */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Weigh-ins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {[...entries].reverse().slice(0, 10).map((entry) => {
                  const displayWeight = units === 'metric'
                    ? convertWeight(entry.weight, 'imperial', 'metric')
                    : entry.weight;

                  return (
                    <div
                      key={entry.date}
                      className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                    >
                      <span className="text-secondary">{formatDate(entry.date)}</span>
                      <span className="text-foreground font-medium">
                        {formatWeightWithUnit(displayWeight, units)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
