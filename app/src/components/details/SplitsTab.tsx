import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { loadSplitAnalysis } from '../../api/accountData';
import {
  AnalysisResponse,
  BackendError,
  SplitResponse,
} from '../../api/backend';
import { analyzeTemplate, getStimulusLevel, stimulusScore } from '../../analysis/stimulus';
import { Exercise, getExercise } from '../../data/exercises';
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

function AnalysisCard({
  title,
  rows,
  score,
  footer,
  delay = 0,
}: {
  title: string;
  rows: MuscleRowData[];
  score: number;
  footer: string;
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxNet = Math.max(0.1, ...rows.map((row) => Math.max(0, row.net)));
  const visibleRows = visibleMuscleRows(rows, expanded);

  return (
    <FadeIn delay={delay}>
      <Glass style={styles.analysisCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{score}</Text>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
      </View>
      <View style={styles.rows}>
        {visibleRows.map((row, index) => {
          const level = getStimulusLevel(row.net);
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
                      width: `${(Math.max(0, row.net) / maxNet) * 100}%`,
                      backgroundColor: stimulusBarColor(level),
                    },
                  ]}
                />
              </View>
              <Text style={styles.net}>{row.net.toFixed(1)}</Text>
            </View>
          );
        })}
      </View>
      {rows.length > 12 && (
        <Pressable onPress={() => setExpanded((value) => !value)}>
          <Text style={styles.action}>{expanded ? 'Show top 12' : `Show all ${rows.length}`}</Text>
        </Pressable>
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

function localRows(template: WorkoutTemplate): MuscleRowData[] {
  const entries = template.exercises
    .map((templateExercise) => {
      const exercise = getExercise(templateExercise.exerciseId);
      return exercise ? { exercise, sets: templateExercise.sets } : null;
    })
    .filter((entry): entry is { exercise: Exercise; sets: number } => entry !== null);
  const net = analyzeTemplate(entries, 2);
  return Object.entries(net)
    .map(([region, value]) => ({
      region,
      name: MUSCLE_REGIONS[region]?.displayName ?? region,
      net: value,
    }))
    .sort((a, b) => b.net - a.net);
}

function DemoSplits({ templates }: { templates: WorkoutTemplate[] }) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;
  const compare = templates.find((template) => template.id === compareId) ?? null;
  const rows = useMemo(() => (selected ? localRows(selected) : []), [selected]);
  const compareRows = useMemo(() => (compare ? localRows(compare) : []), [compare]);

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
          delay={45}
        />
      ) : null}

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
  scoreValue: { color: theme.accent, fontSize: 22, fontWeight: '700' },
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fill: { height: '100%', borderRadius: 3 },
  net: { color: theme.textDim, fontSize: 11, width: 28, textAlign: 'right' },
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
