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

// Viridis-inspired 6-stop color scale for progression ratio 1.0–6.0
const VIRIDIS_STOPS: Array<{ value: number; r: number; g: number; b: number }> = [
  { value: 1.0, r: 68,  g: 1,   b: 84  }, // #440154 - dark violet
  { value: 2.0, r: 59,  g: 82,  b: 139 }, // #3b528b - deep blue
  { value: 3.0, r: 33,  g: 145, b: 140 }, // #21918c - teal
  { value: 4.0, r: 94,  g: 201, b: 98  }, // #5ec962 - green
  { value: 5.0, r: 181, g: 222, b: 43  }, // #b5de2b - lime
  { value: 6.0, r: 253, g: 231, b: 37  }, // #fde725 - bright yellow
];

function getProgressionColor(ratio: number): string {
  const clamped = Math.min(6, Math.max(1, ratio));

  // Find surrounding stops
  for (let i = 0; i < VIRIDIS_STOPS.length - 1; i++) {
    const lo = VIRIDIS_STOPS[i];
    const hi = VIRIDIS_STOPS[i + 1];
    if (clamped >= lo.value && clamped <= hi.value) {
      const t = (clamped - lo.value) / (hi.value - lo.value);
      const r = Math.round(lo.r + t * (hi.r - lo.r));
      const g = Math.round(lo.g + t * (hi.g - lo.g));
      const b = Math.round(lo.b + t * (hi.b - lo.b));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Fallback: at max
  const last = VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1];
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

  const ratioDisplay = point.progressionRatio.toFixed(1);

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
          <span className="text-foreground">{point.rir !== null ? point.rir : 'N/A'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Reps:ER:</span>
          <span className="font-medium" style={{ color: getProgressionColor(point.progressionRatio) }}>
            {point.reps}:{point.effectiveReps} ({ratioDisplay}x)
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

      {/* Viridis gradient legend */}
      <div className="mt-4 text-xs text-secondary">
        <div className="flex items-center gap-2">
          <span className="font-medium shrink-0">Progression:</span>
          <span className="shrink-0">1.0</span>
          <div
            className="flex-1 h-3 rounded-full"
            style={{
              background: `linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #b5de2b, #fde725)`,
            }}
          />
          <span className="shrink-0">6.0+</span>
        </div>
        <div className="flex justify-between mt-1 px-16">
          <span>At capacity</span>
          <span>Strong reserve</span>
        </div>
      </div>
    </div>
  );
}
