import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ProgressionRegion } from '@/types/api.types';

interface ProgressionChartProps {
  progression: ProgressionRegion[];
  height?: number;
}

const COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#059669',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#f43f5e', '#84cc16',
];

export function ProgressionChart({ progression, height = 300 }: ProgressionChartProps) {
  // Only show regions with non-trivial stimulus
  const significantRegions = useMemo(() =>
    progression.filter(r => r.values.some(v => v.net_stimulus > 0.5)).slice(0, 12),
    [progression]
  );

  // Build chart data: [{week: 0, region1: val, region2: val, ...}, ...]
  const chartData = useMemo(() => {
    const weekMap = new Map<number, Record<string, number>>();
    for (const region of significantRegions) {
      for (const v of region.values) {
        if (!weekMap.has(v.week_index)) {
          weekMap.set(v.week_index, { week: v.week_index + 1 });
        }
        weekMap.get(v.week_index)![region.region_id] = Number(v.net_stimulus.toFixed(2));
      }
    }
    return Array.from(weekMap.values()).sort((a, b) => (a.week as number) - (b.week as number));
  }, [significantRegions]);

  if (chartData.length === 0) {
    return <p className="text-xs text-muted">No progression data available</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis
          dataKey="week"
          tick={{ fill: '#9CA3AF', fontSize: 11 }}
          axisLine={{ stroke: '#374151' }}
          label={{ value: 'Week', position: 'insideBottom', offset: -5, fill: '#9CA3AF', fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: '#9CA3AF', fontSize: 11 }}
          axisLine={{ stroke: '#374151' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '10px', color: '#9CA3AF' }}
        />
        {significantRegions.map((region, i) => (
          <Line
            key={region.region_id}
            type="monotone"
            dataKey={region.region_id}
            name={region.display_name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
