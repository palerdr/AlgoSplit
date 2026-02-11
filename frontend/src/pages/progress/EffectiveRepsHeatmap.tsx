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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { useSettingsStore, formatWeightWithUnit, convertWeight } from '@/stores/settingsStore';

interface HeatmapPoint {
  date: string;
  dateFormatted: string;
  weight: number;
  reps: number;
  rir: number | null;
  effectiveReps: number | null;
  isRecent: boolean;
}

interface EffectiveRepsHeatmapProps {
  data: HeatmapPoint[];
}

// Color scale: 0→5 effective reps mapped slate-gray → crimson
const EFFECTIVE_REPS_COLORS: Record<number, string> = {
  0: '#64748b', // slate-500
  1: '#8b5c6b', // blend
  2: '#a14a5a', // blend
  3: '#b83a4a', // blend
  4: '#cc2c3c', // near crimson
  5: '#dc2626', // crimson
};

const NO_RIR_COLOR = '#475569'; // slate-600

function getColor(effectiveReps: number | null): string {
  if (effectiveReps === null) return NO_RIR_COLOR;
  const clamped = Math.min(5, Math.max(0, effectiveReps));
  return EFFECTIVE_REPS_COLORS[clamped] ?? EFFECTIVE_REPS_COLORS[5];
}

function HeatmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HeatmapPoint }>;
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
          <span className="text-foreground">{formatWeightWithUnit(point.weight, units)}</span>
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
          <span className="text-crimson font-medium">
            {point.effectiveReps !== null ? point.effectiveReps : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function EffectiveRepsHeatmap({ data }: EffectiveRepsHeatmapProps) {
  const units = useSettingsStore((s) => s.units);

  const displayData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      displayWeight:
        units === 'metric'
          ? convertWeight(point.weight, 'imperial', 'metric')
          : point.weight,
    }));
  }, [data, units]);

  if (displayData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective Reps Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="chart-fade-in">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <XAxis
                type="number"
                dataKey="reps"
                name="Reps"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
                label={{ value: 'Reps', position: 'insideBottom', offset: -5, fill: '#9CA3AF', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="displayWeight"
                name="Weight"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                label={{ value: units === 'metric' ? 'kg' : 'lbs', position: 'insideLeft', angle: -90, fill: '#9CA3AF', fontSize: 11 }}
              />
              <Tooltip content={<HeatmapTooltip />} />
              <Scatter data={displayData} isAnimationActive={false}>
                {displayData.map((point, index) => (
                  <Cell
                    key={index}
                    fill={getColor(point.effectiveReps)}
                    fillOpacity={point.isRecent ? 1 : 0.4}
                    stroke={point.effectiveReps === null ? '#94a3b8' : 'none'}
                    strokeWidth={point.effectiveReps === null ? 1.5 : 0}
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
                style={{ backgroundColor: EFFECTIVE_REPS_COLORS[n] }}
              />
              <span>{n}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <div
              className="w-3 h-3 rounded-full border border-slate-400"
              style={{ backgroundColor: NO_RIR_COLOR }}
            />
            <span>No RIR</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
