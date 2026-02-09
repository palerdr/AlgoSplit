import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionBreakdown, ExerciseBreakdown, MuscleContribution } from '@/types/api.types';

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  prime: { label: 'Prime', color: 'text-crimson', bg: 'bg-crimson/20' },
  secondary: { label: 'Secondary', color: 'text-amber-400', bg: 'bg-amber-400/20' },
  tertiary: { label: 'Tertiary', color: 'text-blue-400', bg: 'bg-blue-400/20' },
  quaternary: { label: 'Minor', color: 'text-muted', bg: 'bg-white/5' },
};

// Single modifier step in the waterfall
function ModifierStep({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const pctChange = ((value - 1) * 100).toFixed(0);
  const displayPct = value >= 1 ? `+${pctChange}%` : `${pctChange}%`;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-secondary text-sm">{label}</span>
        <span className="text-muted text-xs hidden sm:inline">({description})</span>
      </div>
      <span
        className={cn(
          'font-mono text-sm font-medium',
          value >= 1 ? 'text-green-400' : value >= 0.95 ? 'text-foreground' : value >= 0.85 ? 'text-yellow-400' : 'text-red-400'
        )}
      >
        {displayPct}
      </span>
    </div>
  );
}

// Visual breakdown for a single muscle
function MuscleBreakdown({ mc }: { mc: MuscleContribution }) {
  const [expanded, setExpanded] = useState(false);
  const tierConfig = TIER_CONFIG[mc.tier] || TIER_CONFIG.quaternary;

  // Calculate average modifiers across sets
  const avgBilateral = mc.sets[0]?.bilateral_multiplier ?? 1.0;
  const avgLocal = mc.sets.reduce((s, v) => s + v.local_multiplier, 0) / mc.sets.length;
  const avgCNS = mc.sets.reduce((s, v) => s + v.global_multiplier, 0) / mc.sets.length;
  const avgRecovery = mc.sets.reduce((s, v) => s + v.recovery_multiplier, 0) / mc.sets.length;
  const avgConsecutive = mc.sets.reduce((s, v) => s + (v.consecutive_day_multiplier ?? 1.0), 0) / mc.sets.length;

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Main row - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-steel/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{mc.display_name}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full', tierConfig.bg, tierConfig.color)}>
            {tierConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn('text-lg font-semibold font-mono', tierConfig.color)}>
            {mc.total_stimulus.toFixed(2)}
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted" />
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-black/20 border-t border-white/5">
          {/* Waterfall visualization */}
          <div className="space-y-1 mb-4">
            <div className="flex items-center justify-between py-1">
              <span className="text-secondary text-sm">Base Weight</span>
              <span className="font-mono text-sm text-foreground">{mc.leverage_weight.toFixed(2)} per set</span>
            </div>
            <div className="border-l-2 border-white/10 pl-3 space-y-0.5">
              {avgRecovery < 1 && (
                <ModifierStep
                  label="Recovery"
                  value={avgRecovery}
                  description="trained too recently"
                />
              )}
              <ModifierStep
                label="Bilateral"
                value={avgBilateral}
                description={avgBilateral < 1 ? 'bilateral deficit' : avgBilateral > 1 ? 'unilateral boost' : 'neutral'}
              />
              <ModifierStep
                label="Diminishing Returns"
                value={avgLocal}
                description="volume fatigue curve"
              />
              <ModifierStep
                label="CNS Fatigue"
                value={avgCNS}
                description="session fatigue"
              />
              {avgConsecutive < 1 && (
                <ModifierStep
                  label="Consecutive Days"
                  value={avgConsecutive}
                  description="training without rest"
                />
              )}
            </div>
          </div>

          {/* Per-set detail table */}
          <div className="text-xs">
            <div className="text-muted mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Per-set breakdown
            </div>
            <div className="bg-black/30 rounded p-2 space-y-1 font-mono">
              {mc.sets.map((s, i) => {
                const hasConsecutivePenalty = (s.consecutive_day_multiplier ?? 1.0) < 1;
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-muted">Set {s.set_number}</span>
                    <div className="flex items-center gap-1 text-muted">
                      <span>{s.weight.toFixed(2)}</span>
                      <span className="text-white/30">&times;</span>
                      <span className={s.bilateral_multiplier < 1 ? 'text-yellow-400' : s.bilateral_multiplier > 1 ? 'text-green-400' : ''}>
                        {s.bilateral_multiplier.toFixed(2)}
                      </span>
                      <span className="text-white/30">&times;</span>
                      <span className={s.local_multiplier < 0.9 ? 'text-yellow-400' : ''}>{s.local_multiplier.toFixed(2)}</span>
                      <span className="text-white/30">&times;</span>
                      <span>{s.global_multiplier.toFixed(2)}</span>
                      {hasConsecutivePenalty && (
                        <>
                          <span className="text-white/30">&times;</span>
                          <span className="text-red-400">{(s.consecutive_day_multiplier ?? 1.0).toFixed(2)}</span>
                        </>
                      )}
                      <span className="text-white/30">=</span>
                      <span className="text-foreground font-medium">{s.final_stimulus.toFixed(3)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Exercise card with all muscle breakdowns
function ExerciseCard({ exercise, consecutiveDayPenalty }: { exercise: ExerciseBreakdown; consecutiveDayPenalty: number }) {
  const [open, setOpen] = useState(false);

  const totalStimulus = exercise.muscle_contributions.reduce((sum, mc) => sum + mc.total_stimulus, 0);

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      {/* Exercise header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-steel/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="w-5 h-5 text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted" />
          )}
          <div>
            <span className="font-medium text-foreground">{exercise.name}</span>
            <span className="text-muted ml-2">({exercise.sets} sets)</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted">
            {exercise.is_unilateral && (
              <span className="px-2 py-0.5 rounded bg-green-400/10 text-green-400 text-xs">unilateral +5%</span>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-foreground font-mono">{totalStimulus.toFixed(2)}</div>
            <div className="text-xs text-muted">{exercise.muscle_contributions.length} muscles</div>
          </div>
        </div>
      </button>

      {/* Muscle breakdown list */}
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="text-xs text-muted pb-2 border-b border-white/5 flex items-center gap-4">
            <span>Pattern: <span className="text-secondary">{exercise.pattern.replace(/_/g, ' ')}</span></span>
            <span>Profile: <span className="text-secondary">{exercise.resistance_profile}</span></span>
            {exercise.axial_load > 0 && (
              <span>Spinal load: <span className="text-secondary">{(exercise.axial_load * 100).toFixed(0)}%</span></span>
            )}
          </div>
          {exercise.muscle_contributions.map((mc) => (
            <MuscleBreakdown key={mc.muscle_id} mc={mc} />
          ))}
        </div>
      )}
    </div>
  );
}

// Consecutive day fatigue indicator (enhanced with axial fatigue info)
function ConsecutiveDayIndicator({
  days,
  penalty,
  cumulativeAxialFatigue,
  axialContributors,
}: {
  days: number;
  penalty: number;
  cumulativeAxialFatigue: number;
  axialContributors: Array<{ name: string; axialLoad: number }>;
}) {
  const [showDetail, setShowDetail] = useState(false);

  if (days <= 1) return null;
  const penaltyPct = ((1 - penalty) * 100).toFixed(0);
  const severity = penalty >= 0.85 ? 'mild' : penalty >= 0.65 ? 'moderate' : 'severe';

  const severityConfig = {
    mild: { bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', text: 'text-yellow-400', label: 'Mild fatigue' },
    moderate: { bg: 'bg-orange-400/10', border: 'border-orange-400/30', text: 'text-orange-400', label: 'Moderate fatigue' },
    severe: { bg: 'bg-red-400/10', border: 'border-red-400/30', text: 'text-red-400', label: 'Heavy fatigue' },
  };

  const config = severityConfig[severity];

  return (
    <div className={cn('rounded-lg border', config.bg, config.border)}>
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="w-full px-3 py-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium', config.text)}>{config.label}</span>
            <span className="text-xs text-muted">Day {days} consecutive training</span>
            {cumulativeAxialFatigue > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400">
                Axial: {cumulativeAxialFatigue.toFixed(1)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-sm font-medium', config.text)}>
              -{penaltyPct}% MUR
            </span>
            {(cumulativeAxialFatigue > 0 || axialContributors.length > 0) && (
              showDetail
                ? <ChevronDown className="w-3 h-3 text-muted" />
                : <ChevronRight className="w-3 h-3 text-muted" />
            )}
          </div>
        </div>
      </button>

      {showDetail && (cumulativeAxialFatigue > 0 || axialContributors.length > 0) && (
        <div className="px-3 pb-2 space-y-2 border-t border-white/5">
          <p className="text-xs text-muted pt-2">
            Axial fatigue from heavy compounds (deadlifts, squats, rows) increases spinal load, amplifying CNS decay and consecutive-day penalties.
          </p>
          {axialContributors.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-secondary">Axial contributors in this session:</span>
              <div className="flex flex-wrap gap-2">
                {axialContributors.map((ex) => (
                  <span key={ex.name} className="text-xs px-2 py-0.5 rounded bg-white/5 text-muted">
                    {ex.name} <span className="text-orange-400">{(ex.axialLoad * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Session section (enhanced with axial fatigue badge)
function SessionSection({ session, defaultOpen = false }: { session: SessionBreakdown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const axialContributors = session.exercises
    .filter((ex) => ex.axial_load > 0)
    .map((ex) => ({ name: ex.name, axialLoad: ex.axial_load }));

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-5 h-5 text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted" />
          )}
          <h4 className="font-semibold text-foreground">{session.session_name}</h4>
          <span className="text-sm text-muted">Day {session.day_number}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{session.cumulative_sets} sets</span>
          {session.cumulative_axial_fatigue > 0 && (
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                session.cumulative_axial_fatigue >= 2
                  ? 'bg-orange-400/10 text-orange-400'
                  : 'bg-yellow-400/10 text-yellow-400'
              )}
              title="Cumulative spinal load from heavy compounds — amplifies CNS fatigue"
            >
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Axial {session.cumulative_axial_fatigue.toFixed(1)}
            </span>
          )}
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              session.final_cns_multiplier >= 0.95
                ? 'bg-green-400/10 text-green-400'
                : session.final_cns_multiplier >= 0.9
                ? 'bg-yellow-400/10 text-yellow-400'
                : 'bg-orange-400/10 text-orange-400'
            )}
          >
            CNS at end: {(session.final_cns_multiplier * 100).toFixed(0)}%
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-3">
          <ConsecutiveDayIndicator
            days={session.consecutive_days ?? 1}
            penalty={session.consecutive_day_penalty ?? 1.0}
            cumulativeAxialFatigue={session.cumulative_axial_fatigue ?? 0}
            axialContributors={axialContributors}
          />
          {session.exercises.map((ex, i) => (
            <ExerciseCard key={i} exercise={ex} consecutiveDayPenalty={session.consecutive_day_penalty ?? 1.0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// "By Muscle" view types and components
// ============================================

interface MuscleAggregation {
  muscleId: string;
  displayName: string;
  parentGroup: string;
  totalStimulus: number;
  contributions: Array<{
    exerciseName: string;
    sessionName: string;
    tier: string;
    stimulus: number;
    sets: number;
    mc: MuscleContribution;
    consecutiveDayPenalty: number;
  }>;
}

function buildMuscleAggregations(sessions: SessionBreakdown[]): MuscleAggregation[] {
  const muscleMap = new Map<string, MuscleAggregation>();

  for (const session of sessions) {
    const penalty = session.consecutive_day_penalty ?? 1.0;
    for (const exercise of session.exercises) {
      for (const mc of exercise.muscle_contributions) {
        let agg = muscleMap.get(mc.muscle_id);
        if (!agg) {
          agg = {
            muscleId: mc.muscle_id,
            displayName: mc.display_name,
            parentGroup: '', // will be set from first contribution
            totalStimulus: 0,
            contributions: [],
          };
          muscleMap.set(mc.muscle_id, agg);
        }
        agg.totalStimulus += mc.total_stimulus;
        agg.contributions.push({
          exerciseName: exercise.name,
          sessionName: session.session_name,
          tier: mc.tier,
          stimulus: mc.total_stimulus,
          sets: mc.sets.length,
          mc,
          consecutiveDayPenalty: penalty,
        });
      }
    }
  }

  // Sort by total stimulus descending
  return Array.from(muscleMap.values()).sort((a, b) => b.totalStimulus - a.totalStimulus);
}

// Group muscles by parent group for the "By Muscle" view
function groupByParent(muscles: MuscleAggregation[]): Map<string, MuscleAggregation[]> {
  const groups = new Map<string, MuscleAggregation[]>();
  for (const m of muscles) {
    // Derive parent group from muscle_id patterns
    const parentGroup = getParentGroup(m.muscleId);
    m.parentGroup = parentGroup;
    const list = groups.get(parentGroup) || [];
    list.push(m);
    groups.set(parentGroup, list);
  }
  return groups;
}

function getParentGroup(muscleId: string): string {
  const mapping: Record<string, string> = {
    clavicular: 'chest', sternocostal: 'chest',
    anterior_deltoid: 'shoulders', lateral_deltoid: 'shoulders', posterior_deltoid: 'shoulders',
    trapezius: 'upper back', rhomboids: 'upper back',
    spinal_erectors: 'lower back',
    thoracic_lats: 'lats', iliac_lats: 'lats',
    biceps_brachii: 'elbow flexors', brachialis: 'elbow flexors', brachioradialis: 'elbow flexors',
    wrist_flexors: 'forearms', wrist_extensors: 'forearms',
    triceps_long_head: 'triceps', triceps_lateral_medial: 'triceps',
    glute_max: 'glutes', glute_med_min: 'glutes',
    vasti: 'quads', rectus_femoris: 'quads',
    hip_extensors: 'hamstrings', knee_flexors: 'hamstrings',
    gastrocnemius: 'calves', soleus: 'calves',
    hip_adductors: 'adductors',
    anterior_core: 'abs', lateral_core: 'abs', deep_core: 'abs',
  };
  return mapping[muscleId] || 'other';
}

// A single muscle card in the "By Muscle" view
function MuscleCard({ muscle }: { muscle: MuscleAggregation }) {
  const [expanded, setExpanded] = useState(false);

  // Count tier distribution
  const tierCounts: Record<string, number> = {};
  for (const c of muscle.contributions) {
    tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1;
  }

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-steel/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted" />
          )}
          <span className="font-medium text-foreground">{muscle.displayName}</span>
          <span className="text-xs text-muted capitalize">{muscle.parentGroup}</span>
          <div className="hidden sm:flex items-center gap-1">
            {Object.entries(tierCounts).map(([tier, count]) => {
              const tc = TIER_CONFIG[tier] || TIER_CONFIG.quaternary;
              return (
                <span key={tier} className={cn('text-xs px-1.5 py-0.5 rounded-full', tc.bg, tc.color)}>
                  {count}{tc.label.charAt(0)}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-foreground font-mono">
            {muscle.totalStimulus.toFixed(2)}
          </div>
          <div className="text-xs text-muted">{muscle.contributions.length} exercises</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {muscle.contributions
            .sort((a, b) => b.stimulus - a.stimulus)
            .map((c, i) => {
              const tierConfig = TIER_CONFIG[c.tier] || TIER_CONFIG.quaternary;
              const pctOfTotal = muscle.totalStimulus > 0 ? (c.stimulus / muscle.totalStimulus) * 100 : 0;

              return (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{c.exerciseName}</span>
                      <span className="text-xs text-muted">{c.sessionName}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full', tierConfig.bg, tierConfig.color)}>
                        {tierConfig.label}
                      </span>
                      <span className="text-xs text-muted">{c.sets} sets</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">{pctOfTotal.toFixed(0)}%</span>
                      <span className={cn('font-mono text-sm font-medium', tierConfig.color)}>
                        {c.stimulus.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {/* Stimulus bar visualization */}
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        c.tier === 'prime' ? 'bg-crimson' :
                        c.tier === 'secondary' ? 'bg-amber-400' :
                        c.tier === 'tertiary' ? 'bg-blue-400' : 'bg-white/20'
                      )}
                      style={{ width: `${Math.min(pctOfTotal, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// "By Muscle" grouped view
function MuscleGroupedView({ sessions }: { sessions: SessionBreakdown[] }) {
  const muscles = useMemo(() => buildMuscleAggregations(sessions), [sessions]);
  const grouped = useMemo(() => groupByParent(muscles), [muscles]);

  // Sort groups by total stimulus
  const sortedGroups = useMemo(() => {
    return Array.from(grouped.entries())
      .map(([group, muscles]) => ({
        group,
        muscles,
        totalStimulus: muscles.reduce((sum, m) => sum + m.totalStimulus, 0),
      }))
      .sort((a, b) => b.totalStimulus - a.totalStimulus);
  }, [grouped]);

  return (
    <div className="space-y-6">
      {sortedGroups.map(({ group, muscles, totalStimulus }) => (
        <div key={group} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground capitalize">{group}</h4>
            <span className="text-sm text-muted font-mono">{totalStimulus.toFixed(2)} total</span>
          </div>
          {muscles.map((muscle) => (
            <MuscleCard key={muscle.muscleId} muscle={muscle} />
          ))}
        </div>
      ))}
    </div>
  );
}

// View mode toggle
function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: 'exercise' | 'muscle';
  setViewMode: (mode: 'exercise' | 'muscle') => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-steel/50 p-0.5">
      <button
        onClick={() => setViewMode('exercise')}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          viewMode === 'exercise'
            ? 'bg-crimson/20 text-crimson'
            : 'text-muted hover:text-foreground'
        )}
      >
        By Exercise
      </button>
      <button
        onClick={() => setViewMode('muscle')}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          viewMode === 'muscle'
            ? 'bg-crimson/20 text-crimson'
            : 'text-muted hover:text-foreground'
        )}
      >
        By Muscle
      </button>
    </div>
  );
}

// Main component
export function StimulusBreakdown({ sessionBreakdowns }: { sessionBreakdowns: SessionBreakdown[] }) {
  const [viewMode, setViewMode] = useState<'exercise' | 'muscle'>('exercise');
  const [expandKey, setExpandKey] = useState(0); // bump to force re-mount with new default
  const [allExpanded, setAllExpanded] = useState(false);

  if (!sessionBreakdowns || sessionBreakdowns.length === 0) {
    return null;
  }

  const toggleExpandAll = () => {
    setAllExpanded((prev) => !prev);
    setExpandKey((k) => k + 1); // force re-mount SessionSections
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground mb-1">Stimulus Breakdown</h3>
          <p className="text-sm text-muted">
            {viewMode === 'exercise'
              ? 'See how each exercise contributes stimulus to each muscle, including efficiency losses from fatigue and other modifiers.'
              : 'See total stimulus per muscle from all contributing exercises across your split.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'exercise' && (
            <button
              onClick={toggleExpandAll}
              className="text-xs text-secondary hover:text-foreground transition-colors px-2 py-1 rounded border border-white/8 hover:border-white/15"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>

      {viewMode === 'exercise' ? (
        sessionBreakdowns.map((session, i) => (
          <SessionSection key={`${i}-${expandKey}`} session={session} defaultOpen={allExpanded} />
        ))
      ) : (
        <MuscleGroupedView sessions={sessionBreakdowns} />
      )}
    </div>
  );
}
