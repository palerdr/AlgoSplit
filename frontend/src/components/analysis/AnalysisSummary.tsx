import { Activity, Target, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import type { SummaryStats, MuscleStats } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface AnalysisSummaryProps {
  summary: SummaryStats;
  muscles?: MuscleStats[];
}

export function AnalysisSummary({ summary, muscles }: AnalysisSummaryProps) {
  // Find top and bottom muscles if muscles array is provided
  const topMuscle = muscles?.length
    ? [...muscles].sort((a, b) => b.net_stimulus - a.net_stimulus)[0]
    : null;
  const bottomMuscle = muscles?.length
    ? [...muscles]
        .filter(m => m.stimulus > 0) // Only muscles that are trained
        .sort((a, b) => a.net_stimulus - b.net_stimulus)[0]
    : null;

  const cards = [
    {
      label: 'Avg Net Stimulus',
      value: summary.avg_net_stimulus.toFixed(1),
      icon: Activity,
      color: 'text-crimson',
      bgColor: 'bg-crimson/10',
    },
    {
      label: 'Muscles Trained',
      value: `${summary.muscles_trained}/${summary.total_muscles}`,
      icon: Target,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    ...(topMuscle
      ? [
          {
            label: 'Top Muscle',
            value: topMuscle.display_name,
            subValue: topMuscle.net_stimulus.toFixed(1),
            icon: TrendingUp,
            color: 'text-green-400',
            bgColor: 'bg-green-500/10',
          },
        ]
      : []),
    ...(bottomMuscle
      ? [
          {
            label: 'Lowest Trained',
            value: bottomMuscle.display_name,
            subValue: bottomMuscle.net_stimulus.toFixed(1),
            icon: TrendingDown,
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10',
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-steel rounded-lg p-4 border border-white/5"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('p-1.5 rounded', card.bgColor)}>
              <card.icon className={cn('w-4 h-4', card.color)} />
            </div>
            <span className="text-xs text-muted">{card.label}</span>
          </div>
          <div className="text-xl font-bold text-foreground truncate">
            {card.value}
          </div>
          {'subValue' in card && card.subValue && (
            <div className={cn('text-sm mt-0.5', card.color)}>
              {card.subValue}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Compact inline summary for dashboard cards
interface CompactSummaryProps {
  avgStimulus: number;
  musclesTrained: number;
  totalMuscles: number;
}

export function CompactSummary({ avgStimulus, musclesTrained, totalMuscles }: CompactSummaryProps) {
  const coverage = Math.round((musclesTrained / totalMuscles) * 100);

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <Activity className="w-4 h-4 text-crimson" />
        <span className="text-foreground font-medium">{avgStimulus.toFixed(1)}</span>
        <span className="text-muted">avg</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Layers className="w-4 h-4 text-blue-400" />
        <span className="text-foreground font-medium">{coverage}%</span>
        <span className="text-muted">coverage</span>
      </div>
    </div>
  );
}

// Stats row for split cards
interface SplitStatsRowProps {
  sessions: number;
  cycleLength?: number;
  avgStimulus?: number;
  musclesTrained?: number;
}

export function SplitStatsRow({ sessions, cycleLength, avgStimulus, musclesTrained }: SplitStatsRowProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span>{sessions} sessions</span>
      {cycleLength && (
        <>
          <span className="text-white/20">|</span>
          <span>{cycleLength}-day cycle</span>
        </>
      )}
      {avgStimulus !== undefined && (
        <>
          <span className="text-white/20">|</span>
          <span>
            Avg Stimulus: <span className="text-foreground">{avgStimulus.toFixed(1)}</span>
          </span>
        </>
      )}
      {musclesTrained !== undefined && (
        <>
          <span className="text-white/20">|</span>
          <span>
            <span className="text-foreground">{musclesTrained}</span> muscles
          </span>
        </>
      )}
    </div>
  );
}
