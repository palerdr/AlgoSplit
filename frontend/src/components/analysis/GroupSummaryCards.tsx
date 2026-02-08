import type { MuscleGroupSummary } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface GroupSummaryCardsProps {
  groups: MuscleGroupSummary[];
  onGroupClick?: (group: string) => void;
}

const groupColors: Record<string, string> = {
  chest: 'border-red-500/30 bg-red-500/5',
  shoulders: 'border-orange-500/30 bg-orange-500/5',
  upper_back: 'border-yellow-500/30 bg-yellow-500/5',
  lats: 'border-lime-500/30 bg-lime-500/5',
  lower_back: 'border-green-500/30 bg-green-500/5',
  elbow_flexors: 'border-emerald-500/30 bg-emerald-500/5',
  triceps: 'border-teal-500/30 bg-teal-500/5',
  forearms: 'border-cyan-500/30 bg-cyan-500/5',
  quads: 'border-sky-500/30 bg-sky-500/5',
  hamstrings: 'border-blue-500/30 bg-blue-500/5',
  glutes: 'border-indigo-500/30 bg-indigo-500/5',
  calves: 'border-violet-500/30 bg-violet-500/5',
  adductors: 'border-purple-500/30 bg-purple-500/5',
  abs: 'border-fuchsia-500/30 bg-fuchsia-500/5',
};

function formatGroupName(group: string): string {
  return group
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStimulusRating(avgStimulus: number): { label: string; color: string } {
  if (avgStimulus >= 5) return { label: 'Excellent', color: 'text-green-400' };
  if (avgStimulus >= 4) return { label: 'Great', color: 'text-emerald-400' };
  if (avgStimulus >= 3) return { label: 'Good', color: 'text-teal-400' };
  if (avgStimulus >= 2) return { label: 'Moderate', color: 'text-yellow-400' };
  if (avgStimulus >= 1) return { label: 'Low', color: 'text-orange-400' };
  return { label: 'Minimal', color: 'text-red-400' };
}

export function GroupSummaryCards({ groups, onGroupClick }: GroupSummaryCardsProps) {
  const sortedGroups = [...groups].sort((a, b) => b.total_net_stimulus - a.total_net_stimulus);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {sortedGroups.map((group) => {
        const avgStimulus = group.regions.length > 0
          ? group.total_net_stimulus / group.regions.length
          : 0;
        const rating = getStimulusRating(avgStimulus);
        const colorClass = groupColors[group.group] || 'border-gray-500/30 bg-gray-500/5';

        return (
          <button
            key={group.group}
            onClick={() => onGroupClick?.(group.group)}
            className={cn(
              'p-4 rounded-lg border text-left transition-all hover:scale-[1.02]',
              colorClass,
              onGroupClick && 'cursor-pointer hover:border-white/20'
            )}
          >
            <h4 className="font-medium text-foreground text-sm">
              {formatGroupName(group.group)}
            </h4>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-foreground">
                  {group.total_net_stimulus.toFixed(1)}
                </span>
                <span className={cn('text-xs font-medium', rating.color)}>
                  {rating.label}
                </span>
              </div>
              <div className="text-xs text-muted">
                {group.total_sets} sets | {group.regions.length} regions
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Compact version for inline use
export function GroupSummaryBadges({ groups }: { groups: MuscleGroupSummary[] }) {
  const sortedGroups = [...groups]
    .filter(g => g.total_net_stimulus > 0)
    .sort((a, b) => b.total_net_stimulus - a.total_net_stimulus);

  return (
    <div className="flex flex-wrap gap-2">
      {sortedGroups.map((group) => {
        const avgStimulus = group.regions.length > 0
          ? group.total_net_stimulus / group.regions.length
          : 0;
        const rating = getStimulusRating(avgStimulus);

        return (
          <span
            key={group.group}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-steel text-xs"
          >
            <span className="text-foreground font-medium">
              {formatGroupName(group.group)}
            </span>
            <span className={rating.color}>{avgStimulus.toFixed(1)}</span>
          </span>
        );
      })}
    </div>
  );
}
