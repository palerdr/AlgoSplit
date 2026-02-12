import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useSettingsStore, formatWeightWithUnit, convertWeight } from '@/stores/settingsStore';

interface HeatmapPoint {
  date: string;
  dateFormatted: string;
  weight: number;
  reps: number;
  rir: number | null;
  effectiveReps: number;
  isRecent: boolean;
}

interface ExerciseProgressChartProps {
  data: HeatmapPoint[];
}

interface ChartPoint extends HeatmapPoint {
  timestamp: number;
  displayWeight: number;
  progressionRatio: number;
}

// Progression color scale: 1.0–5.0 (clamped), high-contrast warm→cool
const PROGRESSION_STOPS: Array<{ value: number; r: number; g: number; b: number }> = [
  { value: 1.0, r: 239, g: 68,  b: 68  }, // #ef4444 - red (at capacity)
  { value: 2.0, r: 234, g: 179, b: 8   }, // #eab308 - yellow
  { value: 3.0, r: 34,  g: 197, b: 94  }, // #22c55e - green
  { value: 4.0, r: 6,   g: 182, b: 212 }, // #06b6d4 - cyan
  { value: 5.0, r: 99,  g: 102, b: 241 }, // #6366f1 - indigo (strong reserve)
];

function getProgressionColor(ratio: number): string {
  const clamped = Math.min(5, Math.max(1, ratio));

  for (let i = 0; i < PROGRESSION_STOPS.length - 1; i++) {
    const lo = PROGRESSION_STOPS[i];
    const hi = PROGRESSION_STOPS[i + 1];
    if (clamped >= lo.value && clamped <= hi.value) {
      const t = (clamped - lo.value) / (hi.value - lo.value);
      const r = Math.round(lo.r + t * (hi.r - lo.r));
      const g = Math.round(lo.g + t * (hi.g - lo.g));
      const b = Math.round(lo.b + t * (hi.b - lo.b));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  const last = PROGRESSION_STOPS[PROGRESSION_STOPS.length - 1];
  return `rgb(${last.r}, ${last.g}, ${last.b})`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  const units = useSettingsStore((s) => s.units);
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-charcoal border border-white/10 rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground text-sm">{point.dateFormatted}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Weight:</span>
          <span className="text-foreground">{formatWeightWithUnit(point.displayWeight, units)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Reps:</span>
          <span className="text-foreground">{point.reps}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">RIR:</span>
          <span className="text-foreground">{point.rir ?? 0}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Reps/ER:</span>
          <span className="font-medium" style={{ color: getProgressionColor(point.progressionRatio) }}>
            {point.reps}/{point.effectiveReps} ({point.progressionRatio.toFixed(1)}x)
          </span>
        </div>
      </div>
    </div>
  );
}

export function ExerciseProgressChart({ data }: ExerciseProgressChartProps) {
  const units = useSettingsStore((s) => s.units);

  const displayData = useMemo(() => {
    return data.map((point) => {
      const displayWeight =
        units === 'metric'
          ? convertWeight(point.weight, 'imperial', 'metric')
          : point.weight;
      const progressionRatio = point.reps / Math.max(point.effectiveReps, 1);
      return {
        ...point,
        timestamp: new Date(point.date).getTime(),
        displayWeight,
        progressionRatio,
      };
    });
  }, [data, units]);

  if (displayData.length === 0) return null;

  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div>
      {/* ER explanation */}
      <p className="text-[11px] text-muted mb-2">
        ER (Effective Reps) = 5 - RIR &mdash; higher Reps/ER = more reserve at that effort
      </p>

      <div className="chart-fade-in">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <XAxis
              type="number"
              dataKey="timestamp"
              name="Date"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXTick}
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="displayWeight"
              name="Weight"
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              label={{
                value: units === 'metric' ? 'kg' : 'lbs',
                position: 'insideLeft',
                angle: -90,
                fill: '#9CA3AF',
                fontSize: 11,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Scatter data={displayData} isAnimationActive={false}>
              {displayData.map((point, index) => (
                <Cell
                  key={index}
                  fill={getProgressionColor(point.progressionRatio)}
                  fillOpacity={point.isRecent ? 1 : 0.4}
                  r={6}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Progression gradient legend */}
      <div className="mt-4 text-xs text-secondary">
        <div className="flex items-center gap-2">
          <span className="font-medium shrink-0">Reps/ER:</span>
          <span className="shrink-0">1.0</span>
          <div
            className="flex-1 h-3 rounded-full"
            style={{
              background: `linear-gradient(to right, #ef4444, #eab308, #22c55e, #06b6d4, #6366f1)`,
            }}
          />
          <span className="shrink-0">5.0+</span>
        </div>
        <div className="flex justify-between mt-1 px-8">
          <span>At capacity</span>
          <span>Strong reserve</span>
        </div>
      </div>
    </div>
  );
}
