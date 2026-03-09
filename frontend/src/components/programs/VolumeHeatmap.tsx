import { useMemo } from 'react';
import { format, startOfWeek, differenceInWeeks, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ProgramSessionResponse } from '@/types/api.types';

interface VolumeHeatmapProps {
  sessions: ProgramSessionResponse[];
  startDate: string;
  endDate: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getIntensityClass(sets: number, maxSets: number): string {
  if (sets === 0 || maxSets === 0) return 'bg-steel/30';
  const ratio = sets / maxSets;
  if (ratio <= 0.2) return 'bg-emerald-900/50';
  if (ratio <= 0.4) return 'bg-emerald-700/60';
  if (ratio <= 0.6) return 'bg-amber-700/50';
  if (ratio <= 0.8) return 'bg-amber-500/60';
  return 'bg-red-600/60';
}

function getIntensityLabel(sets: number, maxSets: number): string {
  if (sets === 0 || maxSets === 0) return 'Rest';
  const ratio = sets / maxSets;
  if (ratio <= 0.33) return 'Light';
  if (ratio <= 0.66) return 'Moderate';
  return 'Heavy';
}

export function VolumeHeatmap({ sessions, startDate, endDate }: VolumeHeatmapProps) {
  const heatmapData = useMemo(() => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // Build a map of date -> total sets
    const setsByDate: Record<string, number> = {};
    for (const sess of sessions) {
      const dateKey = sess.date;
      const exerciseSets = sess.exercises.reduce((sum, ex) => sum + ex.sets, 0);
      setsByDate[dateKey] = (setsByDate[dateKey] || 0) + exerciseSets;
    }

    // Align start to beginning of week (Monday)
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const totalWeeks = differenceInWeeks(end, weekStart) + 2;

    // Build grid data: rows = days of week (0-6), cols = weeks
    const grid: { date: string; sets: number; formatted: string }[][] = [];

    for (let w = 0; w < totalWeeks; w++) {
      const weekCells: { date: string; sets: number; formatted: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(weekStart);
        cellDate.setDate(cellDate.getDate() + w * 7 + d);
        const dateKey = format(cellDate, 'yyyy-MM-dd');
        const isInRange = cellDate >= start && cellDate <= end;
        weekCells.push({
          date: dateKey,
          sets: isInRange ? (setsByDate[dateKey] || 0) : -1,
          formatted: format(cellDate, 'MMM d'),
        });
      }
      grid.push(weekCells);
    }

    // Compute max sets across all non-zero days for dynamic scaling
    const maxSets = Object.values(setsByDate).reduce((max, v) => Math.max(max, v), 0);

    return { grid, totalWeeks, maxSets };
  }, [sessions, startDate, endDate]);

  if (!sessions.length) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted">No sessions to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-foreground">Volume Heatmap</h4>
      <p className="text-xs text-muted">Training volume intensity per day (total sets)</p>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-0.5">
          {/* Day labels column */}
          <div className="flex flex-col gap-0.5 mr-1">
            {DAY_LABELS.map((label) => (
              <div key={label} className="h-4 flex items-center justify-end pr-1">
                <span className="text-[9px] text-muted">{label}</span>
              </div>
            ))}
          </div>

          {/* Weeks */}
          {heatmapData.grid.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-0.5">
              {week.map((cell, dIdx) => (
                <div
                  key={`${wIdx}-${dIdx}`}
                  className={cn(
                    'w-4 h-4 rounded-sm transition-colors',
                    cell.sets === -1 ? 'bg-transparent' : getIntensityClass(cell.sets, heatmapData.maxSets)
                  )}
                  title={cell.sets >= 0 ? `${cell.formatted}: ${cell.sets} sets (${getIntensityLabel(cell.sets, heatmapData.maxSets)})` : ''}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted">
        <span>Less</span>
        <div className="flex gap-0.5">
          <div className="w-3 h-3 rounded-sm bg-steel/30" title="Rest" />
          <div className="w-3 h-3 rounded-sm bg-emerald-900/50" title="Light" />
          <div className="w-3 h-3 rounded-sm bg-emerald-700/60" title="Light-Moderate" />
          <div className="w-3 h-3 rounded-sm bg-amber-700/50" title="Moderate" />
          <div className="w-3 h-3 rounded-sm bg-amber-500/60" title="Moderate-Heavy" />
          <div className="w-3 h-3 rounded-sm bg-red-600/60" title="Heavy" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
