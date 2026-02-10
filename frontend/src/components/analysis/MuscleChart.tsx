import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { MuscleStats } from '@/types/api.types';
import { getStimulusLevel } from '@/lib/utils';

const INITIAL_VISIBLE = 15; // Show top N muscles by default

interface MuscleChartProps {
  muscles: MuscleStats[];
  height?: number;
  showAll?: boolean;
  /** Color bars proportionally to the max value instead of fixed thresholds */
  proportionalColors?: boolean;
}

const stimulusColors = [
  '#374151', // 0: gray (none)
  '#991b1b', // 1: dark red (minimal)
  '#dc2626', // 2: red (low)
  '#ea580c', // 3: orange (moderate)
  '#d97706', // 4: amber (good)
  '#65a30d', // 5: lime (high)
  '#16a34a', // 6: green (very high)
  '#059669', // 7: emerald (excellent)
];

function getBarColor(netStimulus: number): string {
  const level = getStimulusLevel(netStimulus);
  return stimulusColors[level];
}

/** Map value to color based on its proportion to the dataset max (0→gray, max→emerald) */
function getProportionalColor(netStimulus: number, maxStimulus: number): string {
  if (netStimulus <= 0 || maxStimulus <= 0) return stimulusColors[0];
  const ratio = netStimulus / maxStimulus; // 0..1
  // Map ratio to color index 1-7
  const level = Math.min(7, Math.max(1, Math.round(ratio * 7)));
  return stimulusColors[level];
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  payload?: Array<{
    payload: MuscleStats;
  }>;
}

function MuscleTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const muscle = payload[0].payload;
  return (
    <div className="bg-charcoal border border-white/10 rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground">{muscle.display_name}</p>
      <p className="text-sm text-muted capitalize">{muscle.parent_group}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Net Stimulus:</span>
          <span className="text-foreground font-medium">
            {muscle.net_stimulus.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Stimulus:</span>
          <span className="text-foreground">{muscle.stimulus.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Atrophy:</span>
          <span className="text-crimson">-{muscle.atrophy.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Prime Sets:</span>
          <span className="text-foreground">{muscle.prime_sets}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-secondary">Frequency:</span>
          <span className="text-foreground">{muscle.frequency.toFixed(1)}x/week</span>
        </div>
      </div>
    </div>
  );
}

export function MuscleChart({ muscles, height = 600, showAll = true, proportionalColors = false }: MuscleChartProps) {
  const [showAllMuscles, setShowAllMuscles] = useState(false);

  const allMuscles = useMemo(() => {
    const sorted = [...muscles].sort((a, b) => b.net_stimulus - a.net_stimulus);
    return showAll ? sorted : sorted.filter(m => m.net_stimulus > 0 || m.stimulus > 0);
  }, [muscles, showAll]);

  const maxStimulus = useMemo(() =>
    allMuscles.reduce((max, m) => Math.max(max, m.net_stimulus), 0),
    [allMuscles]
  );

  const canTruncate = allMuscles.length > INITIAL_VISIBLE;
  const displayMuscles = canTruncate && !showAllMuscles
    ? allMuscles.slice(0, INITIAL_VISIBLE)
    : allMuscles;

  const chartHeight = Math.max(height, displayMuscles.length * 28);

  // Key changes when data or truncation changes → re-triggers CSS fade
  const fadeKey = `${displayMuscles.length}-${displayMuscles[0]?.region_id ?? ''}`;

  return (
    <div>
      <div className="chart-fade-in" key={fadeKey}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={displayMuscles}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              domain={[0, 'auto']}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
            />
            <YAxis
              type="category"
              dataKey="display_name"
              width={150}
              tick={{ fill: '#F3F4F6', fontSize: 13, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: string) => value.length > 18 ? value.slice(0, 16) + '...' : value}
            />
            <Tooltip content={<MuscleTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar
              dataKey="net_stimulus"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              isAnimationActive={false}
            >
              {displayMuscles.map((muscle, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={proportionalColors
                    ? getProportionalColor(muscle.net_stimulus, maxStimulus)
                    : getBarColor(muscle.net_stimulus)
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {canTruncate && (
        <button
          onClick={() => setShowAllMuscles((v) => !v)}
          className="mt-2 text-xs text-secondary hover:text-foreground transition-colors px-3 py-1.5 rounded border border-white/8 hover:border-white/15"
        >
          {showAllMuscles ? `Show Top ${INITIAL_VISIBLE}` : `Show All ${allMuscles.length} Muscles`}
        </button>
      )}
    </div>
  );
}

// Compact version for dashboard
export function MiniMuscleChart({ muscles }: { muscles: MuscleStats[] }) {
  const sortedMuscles = useMemo(() =>
    [...muscles]
      .filter(m => m.net_stimulus > 0)
      .sort((a, b) => b.net_stimulus - a.net_stimulus)
      .slice(0, 10),
    [muscles]
  );

  const chartHeight = Math.max(200, sortedMuscles.length * 32);

  return (
    <div className="chart-fade-in">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={sortedMuscles}
          layout="vertical"
          margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          barCategoryGap="20%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="display_name"
            width={120}
            tick={{ fill: '#F3F4F6', fontSize: 13, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Bar
            dataKey="net_stimulus"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          >
            {sortedMuscles.map((muscle, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(muscle.net_stimulus)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
