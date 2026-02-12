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
import { getERColor } from './ExerciseListPanel';

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
          <span className="text-foreground">{point.rir !== null ? point.rir : 'N/A'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Effective Reps:</span>
          <span className="font-medium" style={{ color: getERColor(point.effectiveReps) }}>
            {point.effectiveReps}
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
      return {
        ...point,
        timestamp: new Date(point.date).getTime(),
        displayWeight,
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
                  fill={getERColor(point.effectiveReps)}
                  fillOpacity={point.isRecent ? 1 : 0.4}
                  r={6}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-secondary">
        <span className="font-medium">Effective Reps:</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getERColor(n) }}
            />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
