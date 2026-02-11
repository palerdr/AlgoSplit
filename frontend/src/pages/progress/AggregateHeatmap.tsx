import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { calculateEffectiveReps } from '@/lib/utils';
import type { WorkoutHistoryResponse } from '@/types/api.types';

// Continuous color interpolation: 0→5 effective reps
// slate-500 (#64748b) → crimson (#dc2626)
const COLOR_STOPS = [
  { at: 0, r: 100, g: 116, b: 139 }, // slate-500
  { at: 1, r: 139, g: 92, b: 107 },
  { at: 2, r: 161, g: 74, b: 90 },
  { at: 3, r: 184, g: 58, b: 74 },
  { at: 4, r: 204, g: 44, b: 60 },
  { at: 5, r: 220, g: 38, b: 38 },  // crimson
];

const NO_RIR_COLOR = '#334155'; // slate-700
const EMPTY_COLOR = 'transparent';

function lerpColor(value: number): string {
  const clamped = Math.min(5, Math.max(0, value));
  // Find the two stops to interpolate between
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (clamped >= COLOR_STOPS[i].at && clamped <= COLOR_STOPS[i + 1].at) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }
  const range = upper.at - lower.at;
  const t = range === 0 ? 0 : (clamped - lower.at) / range;
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

interface CellData {
  avgEffectiveReps: number | null;
  setCount: number;
  dateLabel: string;
}

interface AggregateHeatmapProps {
  workoutsData: WorkoutHistoryResponse;
  onSelectExercise: (name: string) => void;
}

export function AggregateHeatmap({ workoutsData, onSelectExercise }: AggregateHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    exercise: string;
    cell: CellData;
    x: number;
    y: number;
  } | null>(null);

  const { exerciseNames, dateKeys, grid } = useMemo(() => {
    if (!workoutsData?.workouts) return { exerciseNames: [], dateKeys: [], grid: new Map() };

    // Build a map: exerciseName -> dateKey -> CellData
    const gridMap = new Map<string, Map<string, CellData>>();
    const exerciseSet = new Set<string>();
    const dateSet = new Set<string>();

    // Sort workouts oldest → newest
    const sorted = [...workoutsData.workouts].sort(
      (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
    );

    for (const workout of sorted) {
      const d = new Date(workout.completed_at);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      dateSet.add(dateKey);

      for (const ex of workout.exercises) {
        exerciseSet.add(ex.exercise_name);

        const effectiveValues: number[] = [];
        for (let i = 0; i < ex.sets_completed; i++) {
          const reps = ex.reps[i];
          const rir = ex.rir?.[i] ?? null;
          const er = calculateEffectiveReps(reps, rir);
          if (er !== null) effectiveValues.push(er);
        }

        const avgER = effectiveValues.length > 0
          ? effectiveValues.reduce((a, b) => a + b, 0) / effectiveValues.length
          : null;

        if (!gridMap.has(ex.exercise_name)) {
          gridMap.set(ex.exercise_name, new Map());
        }
        const exMap = gridMap.get(ex.exercise_name)!;
        const existing = exMap.get(dateKey);
        if (existing) {
          // Merge multiple workouts on same day: weighted average of effective reps
          const totalSets = existing.setCount + ex.sets_completed;
          let combinedER: number | null;
          if (existing.avgEffectiveReps !== null && avgER !== null) {
            combinedER = (existing.avgEffectiveReps * existing.setCount + avgER * ex.sets_completed) / totalSets;
          } else {
            combinedER = existing.avgEffectiveReps ?? avgER;
          }
          exMap.set(dateKey, { avgEffectiveReps: combinedER, setCount: totalSets, dateLabel });
        } else {
          exMap.set(dateKey, { avgEffectiveReps: avgER, setCount: ex.sets_completed, dateLabel });
        }
      }
    }

    // Sort exercises by most recent session (most recent first), then alphabetically as tiebreaker
    const lastSeen = new Map<string, string>();
    for (const [exName, dates] of gridMap) {
      const latest = Array.from(dates.keys()).sort().pop();
      if (latest) lastSeen.set(exName, latest);
    }
    const names = Array.from(exerciseSet).sort((a, b) => {
      const aLast = lastSeen.get(a) ?? '';
      const bLast = lastSeen.get(b) ?? '';
      if (aLast !== bLast) return bLast.localeCompare(aLast); // most recent first
      return a.localeCompare(b);
    });

    // Dates always chronological left→right
    const keys = Array.from(dateSet).sort();

    return { exerciseNames: names, dateKeys: keys, grid: gridMap };
  }, [workoutsData]);

  if (exerciseNames.length === 0 || dateKeys.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Exercises Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted mb-3">
          Click a row to view that exercise in detail
        </p>
        <div className="overflow-x-auto relative" onMouseLeave={() => setTooltip(null)}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-charcoal text-left text-[10px] text-muted font-medium px-2 py-1 min-w-[120px] max-w-[140px]" />
                {dateKeys.map((dk) => {
                  const d = new Date(dk + 'T12:00:00');
                  return (
                    <th key={dk} className="text-[10px] text-muted font-normal px-0 py-1 min-w-[24px]">
                      <span className="block leading-none">{d.getMonth() + 1}/{d.getDate()}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {exerciseNames.map((name) => {
                const exerciseRow = grid.get(name);
                return (
                  <tr
                    key={name}
                    className="cursor-pointer hover:bg-steel/30 transition-colors"
                    onClick={() => onSelectExercise(name)}
                  >
                    <td className="sticky left-0 z-10 bg-charcoal text-xs text-secondary font-medium px-2 py-0.5 truncate max-w-[140px]" title={name}>
                      {name.length > 20 ? name.slice(0, 18) + '...' : name}
                    </td>
                    {dateKeys.map((dk) => {
                      const cell = exerciseRow?.get(dk);
                      if (!cell) {
                        return (
                          <td key={dk} className="px-0 py-0.5">
                            <div className="mx-auto w-5 h-5 rounded-sm" style={{ backgroundColor: EMPTY_COLOR }} />
                          </td>
                        );
                      }
                      const bg = cell.avgEffectiveReps !== null
                        ? lerpColor(cell.avgEffectiveReps)
                        : NO_RIR_COLOR;
                      // Scale opacity by set count (min 0.5, max 1.0)
                      const opacity = Math.min(1, 0.5 + cell.setCount * 0.1);
                      return (
                        <td
                          key={dk}
                          className="px-0 py-0.5"
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({ exercise: name, cell, x: rect.left + rect.width / 2, y: rect.top });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <div
                            className="mx-auto w-5 h-5 rounded-sm transition-transform hover:scale-125"
                            style={{ backgroundColor: bg, opacity }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Floating tooltip */}
          {tooltip && (
            <div
              className="fixed z-50 pointer-events-none bg-charcoal border border-white/10 rounded-lg p-2.5 shadow-lg text-sm"
              style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
            >
              <p className="font-medium text-foreground text-xs">{tooltip.exercise}</p>
              <p className="text-[10px] text-muted">{tooltip.cell.dateLabel}</p>
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-secondary">{tooltip.cell.setCount} sets</span>
                <span className="text-crimson font-medium">
                  {tooltip.cell.avgEffectiveReps !== null
                    ? `${tooltip.cell.avgEffectiveReps.toFixed(1)} ER`
                    : 'No RIR'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Continuous gradient legend */}
        <div className="flex items-center gap-2 mt-4 text-xs text-secondary">
          <span className="font-medium">Effective Reps:</span>
          <span>0</span>
          <div
            className="h-3 flex-1 max-w-[180px] rounded-sm"
            style={{
              background: `linear-gradient(to right, ${lerpColor(0)}, ${lerpColor(1)}, ${lerpColor(2)}, ${lerpColor(3)}, ${lerpColor(4)}, ${lerpColor(5)})`,
            }}
          />
          <span>5</span>
          <div className="flex items-center gap-1 ml-3">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: NO_RIR_COLOR }} />
            <span>No RIR</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
