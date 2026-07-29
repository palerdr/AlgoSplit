import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { loadSplitAnalysis } from '../../api/accountData';
import {
  AnalysisResponse,
  BackendError,
  SplitResponse,
} from '../../api/backend';
import { getStimulusLevel, stimulusScore } from '../../analysis/stimulus';
import {
  Move,
  Recommendation,
  ScheduleSource,
  recommendForSource,
} from '../../analysis/recommendations';
import { getExercise } from '../../data/exercises';
import { MUSCLE_REGIONS } from '../../data/muscleRegions.gen';
import { WorkoutTemplate } from '../../data/templates';
import { useAccountState } from '../../state/AccountState';
import { theme } from '../../theme';
import FadeIn from '../../ui/FadeIn';
import Glass from '../../ui/Glass';
import { visibleMuscleRows } from './splitView';

interface MuscleRowData {
  region: string;
  name: string;
  net: number;
}

/** Dimmed extension drawn on the same track as the current value. */
const GHOST_GAIN = 'rgba(65,196,110,0.45)';
const GHOST_LOSS = 'rgba(255,255,255,0.2)';
const MOVES_SHOWN = 4;

/** Fatigue direction, in the row's third column. */
function fatigueGlyph(move: Move): { glyph: string; label: string } {
  if (move.deltaFatigue === 0) return { glyph: '=', label: 'no added fatigue' };
  if (move.deltaFatigue < 0) return { glyph: '↓', label: 'frees fatigue' };
  return { glyph: '↑', label: 'costs fatigue' };
}

interface AnalysisState {
  data: AnalysisResponse | null;
  loading: boolean;
  error: string | null;
}

function stimulusBarColor(level: number): string {
  if (level <= 0) return 'rgba(255,255,255,0.07)';
  if (level <= 2) return theme.accentDeep;
  if (level <= 5) return '#23A24A';
  return theme.accent;
}

function useRemoteAnalysis(split: SplitResponse | null, retryToken: number): AnalysisState {
  const account = useAccountState();
  const [state, setState] = useState<AnalysisState>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!split || account.status !== 'authenticated') {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState({ data: null, loading: true, error: null });
    loadSplitAnalysis(split)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof BackendError && error.status === 401) {
          account.refreshSession();
          return;
        }
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [account.status, account.refreshSession, split, retryToken]);

  return state;
}

function Notice({
  title,
  body,
  action,
  onAction,
  delay = 0,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <Glass style={styles.notice}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
        {action && onAction && (
          <Pressable onPress={onAction}>
            <Text style={styles.action}>{action}</Text>
          </Pressable>
        )}
      </Glass>
    </FadeIn>
  );
}

/**
 * The analysis card has two faces rather than two cards: the muscle chart, and
 * the ranked moves that change it. Selecting a move previews it as a dimmed
 * extension on the same tracks — the idiom the split comparison already uses —
 * so the recommendation adds no persistent chrome.
 */
function AnalysisCard({
  title,
  rows,
  score,
  footer,
  recommendation,
  delay = 0,
}: {
  title: string;
  rows: MuscleRowData[];
  score: number;
  footer: string;
  recommendation?: Recommendation | null;
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);

  const moves = recommendation?.moves ?? [];
  // The highest-ranked move previews itself, so the ghost bars and the score
  // projection are explained by a visible, selected row rather than by chrome.
  const selectedMove =
    moves.find((move) => move.id === selectedMoveId) ?? moves[0] ?? null;
  const deltaNet = selectedMove?.deltaNet ?? {};
  // The displayed score comes from the backend engine; the local recommender
  // measures only the change, so project rather than replace it.
  const projectedScore = selectedMove
    ? Math.max(0, Math.min(100, Math.round(score + selectedMove.deltaScore)))
    : null;

  const previewRows = rows.map((row) => ({
    ...row,
    projected: row.net + (deltaNet[row.region] ?? 0),
  }));
  const maxNet = Math.max(
    0.1,
    ...previewRows.map((row) => Math.max(0, row.net, row.projected))
  );
  const visibleRows = visibleMuscleRows(previewRows, expanded);

  return (
    <FadeIn delay={delay}>
      <Glass style={styles.analysisCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.scoreBadge}>
          <View style={styles.scoreLine}>
            <Text style={styles.scoreValue}>{score}</Text>
            {projectedScore !== null && projectedScore !== score && (
              <>
                <Text style={styles.scoreArrow}>→</Text>
                <Text style={styles.scoreProjected}>{projectedScore}</Text>
              </>
            )}
          </View>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
      </View>

      <View style={styles.rows}>
        {visibleRows.map((row, index) => {
          const level = getStimulusLevel(row.net);
          const current = Math.max(0, row.net);
          const projected = Math.max(0, row.projected);
          const kept = Math.min(current, projected);
          const change = Math.abs(projected - current);
          const hasGhost = change > 0.005;
          return (
            <View key={row.region} style={[styles.muscleRow, index > 0 && styles.rowBorder]}>
              <Text style={styles.muscleName} numberOfLines={1}>
                {row.name}
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(kept / maxNet) * 100}%`,
                      backgroundColor: stimulusBarColor(level),
                    },
                    // The two segments read as one bar: only the outer ends
                    // are rounded, so the join stays flush.
                    hasGhost && styles.fillJoinedLeft,
                  ]}
                />
                {hasGhost && (
                  <View
                    style={[
                      styles.fill,
                      styles.fillJoinedRight,
                      {
                        width: `${(change / maxNet) * 100}%`,
                        backgroundColor:
                          projected > current ? GHOST_GAIN : GHOST_LOSS,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.net}>{row.net.toFixed(1)}</Text>
            </View>
          );
        })}
      </View>

      {rows.length > 12 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
        >
          <Text style={styles.action}>
            {expanded ? 'Show top 12' : `Show all ${rows.length}`}
          </Text>
        </Pressable>
      )}

      {moves.length > 0 && (
        <View style={styles.movesSection}>
          <Text style={styles.movesLabel}>Best moves</Text>
          {moves.map((move) => {
            const active = selectedMove?.id === move.id;
            const cost = fatigueGlyph(move);
            const scope = move.occurrences > 1 ? ` ×${move.occurrences}` : '';
            return (
              <Pressable
                key={move.id}
                accessible
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${move.action}, ${move.exerciseName}, ${
                  move.sessionName
                }. Plus ${move.deltaScore.toFixed(1)} score, ${cost.label}${
                  move.drivers.length > 0 ? `, mainly ${move.drivers.join(' and ')}` : ''
                }.`}
                onPress={() => setSelectedMoveId(move.id)}
              >
                <View style={[styles.moveRow, active && styles.moveRowActive]}>
                  <Text
                    style={[styles.moveLabel, active && styles.moveLabelActive]}
                    numberOfLines={1}
                  >
                    {move.exerciseName}
                    {scope} · {move.action}
                  </Text>
                  <Text style={styles.moveDelta}>+{move.deltaScore.toFixed(1)}</Text>
                  <Text style={styles.moveCost}>{cost.glyph}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.hint}>{footer}</Text>
      </Glass>
    </FadeIn>
  );
}

function rowsFromAnalysis(data: AnalysisResponse): MuscleRowData[] {
  return [...data.muscles]
    .map((muscle) => ({
      region: muscle.region_id,
      name: muscle.display_name,
      net: muscle.net_stimulus,
    }))
    .sort((a, b) => b.net - a.net);
}

function rowsFromNet(net: Record<string, number>): MuscleRowData[] {
  return Object.entries(net)
    .map(([region, value]) => ({
      region,
      name: MUSCLE_REGIONS[region]?.displayName ?? region,
      net: value,
    }))
    .sort((a, b) => b.net - a.net);
}

/** Demo templates run twice a week; days 1 and 4 place them on the cycle. */
function demoSource(template: WorkoutTemplate): ScheduleSource {
  const exercises = template.exercises
    .map((templateExercise) => {
      const exercise = getExercise(templateExercise.exerciseId);
      return exercise ? { name: exercise.name, sets: templateExercise.sets } : null;
    })
    .filter((entry): entry is { name: string; sets: number } => entry !== null);
  return {
    cycleLength: 7,
    sessions: [1, 4].map((day) => ({ name: template.name, day, exercises })),
  };
}

/**
 * Rebuild the saved split for the local recommender. The displayed chart still
 * comes from the backend engine; this only measures what a change would do.
 */
function splitSource(split: SplitResponse): ScheduleSource {
  return {
    cycleLength: split.cycle_length,
    sessions: split.sessions.map((session) => ({
      name: session.name,
      day: session.day_number,
      exercises: [...session.exercises]
        .sort((left, right) => left.order_index - right.order_index)
        .map((exercise) => ({
          name: exercise.exercise_name,
          sets: exercise.sets,
          unilateral: exercise.unilateral,
          resistanceProfile: exercise.resistance_profile,
        })),
    })),
  };
}

function DemoSplits({ templates }: { templates: WorkoutTemplate[] }) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;
  const compare = templates.find((template) => template.id === compareId) ?? null;
  // Chart and recommendation share one basis so the ghost preview lines up.
  const recommendation = useMemo(
    () => (selected ? recommendForSource(demoSource(selected), MOVES_SHOWN) : null),
    [selected]
  );
  const compareRecommendation = useMemo(
    () => (compare ? recommendForSource(demoSource(compare), MOVES_SHOWN) : null),
    [compare]
  );
  const rows = useMemo(
    () => (recommendation ? rowsFromNet(recommendation.baselineNet) : []),
    [recommendation]
  );
  const compareRows = useMemo(
    () => (compareRecommendation ? rowsFromNet(compareRecommendation.baselineNet) : []),
    [compareRecommendation]
  );

  return (
    <View>
      <Notice
        title="Demo analysis"
        body="These local examples use a clearly labeled two-session week. Sign in from Account to analyze your saved schedule."
      />
      <FadeIn delay={45}>
        <View style={styles.picker}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              onPress={() => {
                setSelectedId(template.id);
                if (compareId === template.id) setCompareId(null);
              }}
            >
              <Glass style={styles.chip} interactive>
                <Text
                  style={[styles.chipText, selected?.id === template.id && styles.chipTextActive]}
                >
                  {template.name}
                </Text>
              </Glass>
            </Pressable>
          ))}
        </View>
      </FadeIn>
      {selected ? (
        <AnalysisCard
          title="Steady-state weekly stimulus"
          rows={rows}
          score={stimulusScore(Object.fromEntries(rows.map((row) => [row.region, row.net])))}
          footer="Demo engine · fixed example at 2×/week"
          recommendation={recommendation}
          delay={90}
        />
      ) : (
        <Notice title="No demo splits" body="Create a local workout template to analyze it here." />
      )}
      {selected && templates.length > 1 && (
        <>
          <FadeIn delay={135}>
            <Text style={styles.sectionLabel}>Compare against</Text>
            <View style={styles.picker}>
              {templates
                .filter((template) => template.id !== selected.id)
                .map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() =>
                      setCompareId((value) => (value === template.id ? null : template.id))
                    }
                  >
                    <Glass style={styles.chip} interactive>
                      <Text
                        style={[styles.chipText, compare?.id === template.id && styles.chipTextActive]}
                      >
                        {template.name}
                      </Text>
                    </Glass>
                  </Pressable>
                ))}
            </View>
          </FadeIn>
          {compare && (
            <AnalysisCard
              title={`${selected.name} vs ${compare.name}`}
              rows={compareRows}
              score={stimulusScore(
                Object.fromEntries(compareRows.map((row) => [row.region, row.net]))
              )}
              footer="Selected comparison · demo engine at 2×/week"
              recommendation={compareRecommendation}
              delay={180}
            />
          )}
        </>
      )}
    </View>
  );
}

function RemoteComparison({
  selected,
  comparison,
  delay = 0,
}: {
  selected: AnalysisResponse;
  comparison: AnalysisResponse;
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const second = new Map(comparison.muscles.map((muscle) => [muscle.region_id, muscle]));
    return selected.muscles
      .map((muscle) => ({
        region: muscle.region_id,
        name: muscle.display_name,
        first: muscle.net_stimulus,
        second: second.get(muscle.region_id)?.net_stimulus ?? 0,
      }))
      .sort((a, b) => Math.max(b.first, b.second) - Math.max(a.first, a.second));
  }, [selected, comparison]);
  const visible = visibleMuscleRows(rows, expanded);
  const max = Math.max(0.1, ...rows.map((row) => Math.max(0, row.first, row.second)));

  return (
    <FadeIn delay={delay}>
      <Glass style={styles.analysisCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>
          {selected.split_name} vs {comparison.split_name}
        </Text>
        <Text style={styles.compareScore}>
          {stimulusScore(selected.muscles)} / {stimulusScore(comparison.muscles)}
        </Text>
      </View>
      {visible.map((row, index) => (
        <View key={row.region} style={[styles.compareRow, index > 0 && styles.rowBorder]}>
          <Text style={styles.muscleName} numberOfLines={1}>
            {row.name}
          </Text>
          <View style={styles.compareTracks}>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${(Math.max(0, row.first) / max) * 100}%`,
                    backgroundColor: stimulusBarColor(getStimulusLevel(row.first)),
                  },
                ]}
              />
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${(Math.max(0, row.second) / max) * 100}%`,
                    backgroundColor: stimulusBarColor(getStimulusLevel(row.second)),
                    opacity: 0.55,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      ))}
      {rows.length > 12 && (
        <Pressable onPress={() => setExpanded((value) => !value)}>
          <Text style={styles.action}>{expanded ? 'Show top 12' : `Show all ${rows.length}`}</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>top = selected · dim = comparison · saved schedules</Text>
      </Glass>
    </FadeIn>
  );
}

export default function SplitsTab({ templates }: { templates: WorkoutTemplate[] }) {
  const account = useAccountState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [analysisRetry, setAnalysisRetry] = useState(0);
  const [compareRetry, setCompareRetry] = useState(0);
  const splits = account.splits.data;
  const selected = splits.find((split) => split.id === selectedId) ?? splits[0] ?? null;
  const comparison = splits.find((split) => split.id === compareId) ?? null;
  const selectedAnalysis = useRemoteAnalysis(selected, analysisRetry);
  const comparisonAnalysis = useRemoteAnalysis(comparison, compareRetry);
  // Ranking candidate changes means re-running the engine once per candidate,
  // so it runs locally against the saved split rather than as N round trips.
  const recommendation = useMemo(
    () => (selected ? recommendForSource(splitSource(selected), MOVES_SHOWN) : null),
    [selected]
  );

  useEffect(() => {
    if (account.status === 'authenticated') account.ensureSplits();
  }, [account.status, account.ensureSplits]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  if (account.status === 'signedOut' || account.status === 'unconfigured') {
    return <DemoSplits templates={templates} />;
  }
  if (account.status === 'checking') {
    return <Notice title="Checking your account" body="Loading your authenticated data source…" />;
  }
  if (account.status === 'error') {
    return (
      <Notice
        title="Account connection failed"
        body={account.sessionError ?? 'Could not verify your account. Local analysis was not substituted.'}
        action="Retry"
        onAction={account.refreshSession}
      />
    );
  }
  if (account.splits.loading && !account.splits.loaded) {
    return <Notice title="Loading splits" body="Fetching your saved sessions and exercises…" />;
  }
  if (account.splits.error) {
    return (
      <Notice
        title="Splits could not load"
        body={`${account.splits.error} Local templates were not substituted.`}
        action="Retry"
        onAction={account.refreshSplits}
      />
    );
  }
  if (!selected) {
    return <Notice title="No saved splits" body="Create a split on your account to analyze it here." />;
  }

  return (
    <View>
      <FadeIn>
        <View style={styles.picker}>
          {splits.map((split) => (
            <Pressable
              key={split.id}
              onPress={() => {
                setSelectedId(split.id);
                if (compareId === split.id) setCompareId(null);
              }}
            >
              <Glass style={styles.chip} interactive>
                <Text style={[styles.chipText, selected.id === split.id && styles.chipTextActive]}>
                  {split.name}
                </Text>
              </Glass>
            </Pressable>
          ))}
        </View>
      </FadeIn>

      {selectedAnalysis.loading ? (
        <Notice
          title="Analyzing split"
          body="Using the saved session days and analysis settings…"
          delay={45}
        />
      ) : selectedAnalysis.error ? (
        <Notice
          title="Analysis failed"
          body={`${selectedAnalysis.error} The local engine was not used as a fallback.`}
          action="Retry"
          onAction={() => setAnalysisRetry((value) => value + 1)}
          delay={45}
        />
      ) : selectedAnalysis.data ? (
        <AnalysisCard
          title="Steady-state weekly stimulus"
          rows={rowsFromAnalysis(selectedAnalysis.data)}
          score={stimulusScore(selectedAnalysis.data.muscles)}
          footer={`net = stimulus − atrophy · ${selectedAnalysis.data.cycle_length}-day saved cycle`}
          recommendation={recommendation}
          delay={45}
        />
      ) : null}

      {recommendation && recommendation.unresolved.length > 0 && (
        <Notice
          title="Some exercises were not recognized"
          body={`${recommendation.unresolved.join(', ')} — these are excluded from the suggestions, so their sets are not counted.`}
          delay={60}
        />
      )}

      {splits.length > 1 && (
        <>
          <FadeIn delay={90}>
            <Text style={styles.sectionLabel}>Compare against</Text>
            <View style={styles.picker}>
              {splits
                .filter((split) => split.id !== selected.id)
                .map((split) => (
                  <Pressable
                    key={split.id}
                    onPress={() => setCompareId((value) => (value === split.id ? null : split.id))}
                  >
                    <Glass style={styles.chip} interactive>
                      <Text
                        style={[styles.chipText, comparison?.id === split.id && styles.chipTextActive]}
                      >
                        {split.name}
                      </Text>
                    </Glass>
                  </Pressable>
                ))}
            </View>
          </FadeIn>
          {comparison && comparisonAnalysis.loading && (
            <Notice
              title="Comparing splits"
              body="Analyzing the second saved schedule…"
              delay={135}
            />
          )}
          {comparison && comparisonAnalysis.error && (
            <Notice
              title="Comparison failed"
              body={comparisonAnalysis.error}
              action="Retry"
              onAction={() => setCompareRetry((value) => value + 1)}
              delay={135}
            />
          )}
          {selectedAnalysis.data && comparisonAnalysis.data && (
            <RemoteComparison
              selected={selectedAnalysis.data}
              comparison={comparisonAnalysis.data}
              delay={135}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 18, padding: 16, marginBottom: 14 },
  noticeTitle: { color: theme.text, fontSize: 15, fontWeight: '600', marginBottom: 5 },
  noticeBody: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: theme.accent },
  action: { color: theme.accent, fontSize: 12, fontWeight: '600', marginTop: 10 },
  analysisCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  chartTitle: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  scoreBadge: { alignItems: 'flex-end' },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  scoreValue: { color: theme.accent, fontSize: 22, fontWeight: '700' },
  scoreArrow: { color: theme.textDim, fontSize: 13 },
  scoreProjected: {
    color: theme.accent,
    fontSize: 22,
    fontWeight: '700',
    opacity: 0.55,
  },
  scoreLabel: { color: theme.textDim, fontSize: 9, textTransform: 'uppercase' },
  rows: { marginTop: 2 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, gap: 10 },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  muscleName: { color: theme.text, fontSize: 13, width: 116 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    // Row direction so the current value and its projected extension sit
    // side by side on one track rather than stacking.
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fill: { height: '100%', borderRadius: 3 },
  fillJoinedLeft: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  fillJoinedRight: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  net: { color: theme.textDim, fontSize: 11, width: 28, textAlign: 'right' },
  movesSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  movesLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  // Same 34pt rhythm as the muscle rows above, so the two lists read as one
  // card rather than a chart with a panel bolted underneath.
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    gap: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 9,
  },
  moveRowActive: { backgroundColor: 'rgba(65,196,110,0.14)' },
  moveLabel: { flex: 1, minWidth: 0, color: theme.text, fontSize: 13 },
  moveLabelActive: { color: theme.accent, fontWeight: '600' },
  moveDelta: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  moveCost: { color: theme.textDim, fontSize: 12, width: 12, textAlign: 'center' },
  hint: { color: theme.textDim, fontSize: 10, lineHeight: 15, marginTop: 10 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 9,
  },
  compareScore: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  compareRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 10 },
  compareTracks: { flex: 1, gap: 4 },
});
