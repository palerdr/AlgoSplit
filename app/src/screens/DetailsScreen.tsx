import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  analyzeSplit,
  backendConfigured,
  netFromAnalysis,
  templateToSplitRequest,
} from '../api/algosplit';
import { useAppState, CompletedWorkout } from '../state/AppState';
import { WorkoutTemplate } from '../data/templates';
import { getExercise, Exercise } from '../data/exercises';
import { MUSCLE_REGIONS } from '../data/muscleRegions.gen';
import {
  analyzeTemplate,
  e1rm,
  getStimulusLevel,
  rollingNet,
  stimulusScore,
} from '../analysis/stimulus';
import { HEAT_RAMP } from '../3d/regionColors';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';
import ServerTab from './ServerTab';

interface DetailsScreenProps {
  onBack: () => void;
}

const DAY_MS = 86_400_000;
const tick = () => Haptics.selectionAsync().catch(() => {});

function fmtVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function StatTile({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <FadeIn delay={delay} style={{ flex: 1 }}>
      <Glass style={styles.statTile}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Glass>
    </FadeIn>
  );
}

// ── Weekly volume bars (last 4 weeks, subtle accent) ──────────────
function VolumeChart({ history }: { history: CompletedWorkout[] }) {
  const weeks = useMemo(() => {
    const buckets = [0, 0, 0, 0]; // 3w ago … this week
    const now = Date.now();
    for (const w of history) {
      const daysAgo = (now - new Date(w.date).getTime()) / DAY_MS;
      const idx = 3 - Math.floor(daysAgo / 7);
      if (idx >= 0 && idx <= 3) buckets[idx] += w.volume;
    }
    return buckets;
  }, [history]);

  const max = Math.max(1, ...weeks);
  const labels = ['3w', '2w', '1w', 'now'];

  return (
    <Glass style={styles.chartCard}>
      <Text style={styles.chartTitle}>Volume · weekly</Text>
      <View style={styles.chartArea}>
        {weeks.map((v, i) => (
          <View key={i} style={styles.chartCol}>
            <Text style={styles.chartValue}>{v > 0 ? fmtVolume(v) : ''}</Text>
            <View style={styles.chartBarTrack}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${Math.max(4, (v / max) * 100)}%`, opacity: i === 3 ? 1 : 0.55 },
                ]}
              />
            </View>
            <Text style={[styles.chartLabel, i === 3 && { color: theme.text }]}>{labels[i]}</Text>
          </View>
        ))}
      </View>
    </Glass>
  );
}

// ── Stimulus score (mean adequacy across trained muscles) ─────────
function ScoreBar({ history }: { history: CompletedWorkout[] }) {
  const score = useMemo(() => {
    const now = Date.now();
    return stimulusScore(
      rollingNet(
        history.map((w) => ({
          stimulus: w.stimulus,
          daysAgo: (now - new Date(w.date).getTime()) / DAY_MS,
        }))
      )
    );
  }, [history]);

  return (
    <Glass style={styles.scoreCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>Stimulus score</Text>
        <Text style={styles.scoreValue}>{score}</Text>
      </View>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${Math.min(100, score)}%` }]} />
      </View>
      <Text style={styles.scoreHint}>trained muscles at a productive weekly dose</Text>
    </Glass>
  );
}

// ── GitHub-style training grid (last 15 weeks) ────────────────────
const GRID_WEEKS = 15;

function TrainingGrid({ history }: { history: CompletedWorkout[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of history) {
      const d = new Date(w.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, (map.get(key) ?? 0) + w.volume);
    }
    return map;
  }, [history]);

  const cellFor = (daysAgo: number) => {
    const d = new Date(Date.now() - daysAgo * DAY_MS);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const volume = byDay.get(key) ?? 0;
    if (volume <= 0) return styles.gridCellEmpty;
    if (volume >= 14000) return styles.gridCellHigh;
    if (volume >= 9000) return styles.gridCellMid;
    return styles.gridCellLow;
  };

  return (
    <View style={styles.grid}>
      {Array.from({ length: GRID_WEEKS }, (_, col) => (
        <View key={col} style={styles.gridCol}>
          {Array.from({ length: 7 }, (_, row) => {
            const daysAgo = (GRID_WEEKS - 1 - col) * 7 + (6 - row);
            return <View key={row} style={[styles.gridCell, cellFor(daysAgo)]} />;
          })}
        </View>
      ))}
    </View>
  );
}

function HistoryCard({ workout, delay }: { workout: CompletedWorkout; delay: number }) {
  return (
    <FadeIn delay={delay}>
      <Glass style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{workout.name}</Text>
            <Text style={workout.edited ? styles.editedTag : styles.standardTag}>
              {workout.edited ? 'edited' : 'standard'}
            </Text>
          </View>
          <Text style={styles.cardDate}>{fmtDate(workout.date)}</Text>
        </View>
        <Text style={styles.cardSub} numberOfLines={2}>
          {workout.exercises.map((e) => `${e.name} ×${e.sets}`).join(' · ')}
        </Text>
        <View style={styles.cardStats}>
          <Text style={styles.cardStat}>
            <Text style={styles.cardStatValue}>{workout.totalSets}</Text> sets
          </Text>
          <Text style={styles.cardStat}>
            <Text style={styles.cardStatValue}>{fmtVolume(workout.volume)}</Text> lbs
          </Text>
          <Text style={styles.cardStat}>
            <Text style={styles.cardStatValue}>{workout.durationMin}</Text> min
          </Text>
        </View>
      </Glass>
    </FadeIn>
  );
}

// ── Split analysis: real backend engine when configured, local port
//    of the engine otherwise — same contract either way ─────────────
function SplitAnalysis({ template }: { template: WorkoutTemplate }) {
  const [frequency, setFrequency] = useState(2);
  const [remoteNet, setRemoteNet] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRemoteNet(null);
    if (!backendConfigured()) return;
    analyzeSplit(templateToSplitRequest(template, frequency))
      .then((res) => {
        if (!cancelled) setRemoteNet(netFromAnalysis(res));
      })
      .catch(() => {
        // backend unreachable — the local engine result stands
      });
    return () => {
      cancelled = true;
    };
  }, [template, frequency]);

  const analysis = useMemo(() => {
    const entries = template.exercises
      .map((te) => {
        const exercise = getExercise(te.exerciseId);
        return exercise ? { exercise, sets: te.sets } : null;
      })
      .filter((e): e is { exercise: Exercise; sets: number } => e !== null);
    const net = remoteNet ?? analyzeTemplate(entries, frequency);
    const rows = Object.entries(net)
      .map(([region, value]) => ({
        region,
        name: MUSCLE_REGIONS[region]?.displayName ?? region,
        net: value,
        level: getStimulusLevel(value),
      }))
      .sort((a, b) => b.net - a.net);
    return { net, rows, score: stimulusScore(net), engine: remoteNet ? 'backend' : 'local' };
  }, [template, frequency, remoteNet]);

  const maxNet = Math.max(0.1, ...analysis.rows.map((r) => r.net));

  return (
    <View>
      <View style={styles.freqRow}>
        {[1, 2, 3].map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              tick();
              setFrequency(f);
            }}
          >
            <View style={[styles.freqChip, frequency === f && styles.freqChipActive]}>
              <Text style={[styles.freqText, frequency === f && styles.freqTextActive]}>
                {f}×/week
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.freqScore}>
          <Text style={styles.freqScoreValue}>{analysis.score}</Text>
          <Text style={styles.freqScoreLabel}>score</Text>
        </View>
      </View>

      <Glass style={styles.analysisCard}>
        <Text style={styles.chartTitle}>Steady-state weekly stimulus</Text>
        <View style={{ marginTop: 12 }}>
          {analysis.rows.slice(0, 12).map((row) => (
            <View key={row.region} style={styles.muscleRow}>
              <Text style={styles.muscleName} numberOfLines={1}>
                {row.name}
              </Text>
              <View style={styles.muscleTrack}>
                <View
                  style={[
                    styles.muscleFill,
                    {
                      width: `${Math.max(3, (Math.max(0, row.net) / maxNet) * 100)}%`,
                      backgroundColor: HEAT_RAMP[Math.max(1, row.level)],
                    },
                  ]}
                />
              </View>
              <Text style={styles.muscleNet}>{row.net.toFixed(1)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.scoreHint}>
          net = stimulus − atrophy over a repeating week · green ≥ 1.3 is growing · engine:{' '}
          {analysis.engine}
        </Text>
      </Glass>
    </View>
  );
}

// A/B comparison: two templates' steady-state nets side by side.
function CompareBlock({ a, b }: { a: WorkoutTemplate; b: WorkoutTemplate }) {
  const nets = useMemo(() => {
    const toEntries = (t: WorkoutTemplate) =>
      t.exercises
        .map((te) => {
          const exercise = getExercise(te.exerciseId);
          return exercise ? { exercise, sets: te.sets } : null;
        })
        .filter((e): e is { exercise: Exercise; sets: number } => e !== null);
    const netA = analyzeTemplate(toEntries(a), 2);
    const netB = analyzeTemplate(toEntries(b), 2);
    const regions = [...new Set([...Object.keys(netA), ...Object.keys(netB)])]
      .map((region) => ({
        region,
        name: MUSCLE_REGIONS[region]?.displayName ?? region,
        a: netA[region] ?? 0,
        b: netB[region] ?? 0,
      }))
      .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
    return { regions, scoreA: stimulusScore(netA), scoreB: stimulusScore(netB) };
  }, [a, b]);

  const max = Math.max(0.1, ...nets.regions.map((r) => Math.max(r.a, r.b)));

  return (
    <Glass style={styles.analysisCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>
          {a.name} vs {b.name}
        </Text>
        <Text style={styles.scoreValue}>
          {nets.scoreA}<Text style={styles.progressBestDim}> / {nets.scoreB}</Text>
        </Text>
      </View>
      {nets.regions.slice(0, 12).map((row) => (
        <View key={row.region} style={styles.compareRow}>
          <Text style={styles.muscleName} numberOfLines={1}>
            {row.name}
          </Text>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={styles.muscleTrack}>
              <View
                style={[
                  styles.muscleFill,
                  {
                    width: `${Math.max(2, (Math.max(0, row.a) / max) * 100)}%`,
                    backgroundColor: HEAT_RAMP[Math.max(1, getStimulusLevel(row.a))],
                  },
                ]}
              />
            </View>
            <View style={styles.muscleTrack}>
              <View
                style={[
                  styles.muscleFill,
                  {
                    width: `${Math.max(2, (Math.max(0, row.b) / max) * 100)}%`,
                    backgroundColor: HEAT_RAMP[Math.max(1, getStimulusLevel(row.b))],
                    opacity: 0.55,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      ))}
      <Text style={styles.scoreHint}>top bar = {a.name} · dim bar = {b.name} · 2×/week</Text>
    </Glass>
  );
}

function SplitsTab({ templates }: { templates: WorkoutTemplate[] }) {
  const [selected, setSelected] = useState<WorkoutTemplate | null>(templates[0] ?? null);
  const [compareWith, setCompareWith] = useState<WorkoutTemplate | null>(null);
  return (
    <View>
      <View style={styles.splitPicker}>
        {templates.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              tick();
              setSelected(t);
              if (compareWith?.id === t.id) setCompareWith(null);
            }}
          >
            <View style={[styles.freqChip, selected?.id === t.id && styles.freqChipActive]}>
              <Text
                style={[styles.freqText, selected?.id === t.id && styles.freqTextActive]}
                numberOfLines={1}
              >
                {t.name}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {selected ? (
        <SplitAnalysis template={selected} />
      ) : (
        <Text style={styles.empty}>No workouts yet</Text>
      )}

      {selected && templates.length > 1 && (
        <View>
          <Text style={styles.sectionLabel}>Compare against</Text>
          <View style={styles.splitPicker}>
            {templates
              .filter((t) => t.id !== selected.id)
              .map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    tick();
                    setCompareWith((prev) => (prev?.id === t.id ? null : t));
                  }}
                >
                  <View
                    style={[styles.freqChip, compareWith?.id === t.id && styles.freqChipActive]}
                  >
                    <Text
                      style={[styles.freqText, compareWith?.id === t.id && styles.freqTextActive]}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
          </View>
          {compareWith && <CompareBlock a={selected} b={compareWith} />}
        </View>
      )}
    </View>
  );
}

// ── Progress (best e1RM per exercise from logged records) ─────────
function ProgressTab({ history }: { history: CompletedWorkout[] }) {
  const rows = useMemo(() => {
    const byExercise = new Map<string, { best: number; last: number; lastDate: number }>();
    // history is newest-first; walk oldest-first so "last" ends up most recent
    for (let i = history.length - 1; i >= 0; i--) {
      const w = history[i];
      const t = new Date(w.date).getTime();
      for (const ex of w.exercises) {
        const sessionBest = Math.max(0, ...ex.records.map((r) => e1rm(r.weight, r.reps)));
        if (sessionBest <= 0) continue;
        const prev = byExercise.get(ex.name);
        byExercise.set(ex.name, {
          best: Math.max(prev?.best ?? 0, sessionBest),
          last: sessionBest,
          lastDate: t,
        });
      }
    }
    return [...byExercise.entries()]
      .map(([name, v]) => ({ name, ...v, atBest: v.last >= v.best - 0.5 }))
      .sort((a, b) => b.best - a.best);
  }, [history]);

  if (rows.length === 0) {
    return <Text style={styles.empty}>Complete a workout to start tracking strength</Text>;
  }

  return (
    <Glass style={styles.analysisCard}>
      <Text style={styles.chartTitle}>Estimated 1RM · best vs last</Text>
      <View style={{ marginTop: 8 }}>
        {rows.slice(0, 14).map((row, i) => (
          <View key={row.name} style={[styles.progressRowLine, i > 0 && styles.muscleRowBorder]}>
            <Text style={styles.muscleName} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.progressDelta, row.atBest ? styles.deltaUp : styles.deltaDown]}>
              {row.atBest ? '▲' : '▽'}
            </Text>
            <Text style={styles.progressBest}>
              {Math.round(row.last)} <Text style={styles.progressBestDim}>/ {Math.round(row.best)}</Text>
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.scoreHint}>Brzycki e1RM from your logged sets</Text>
    </Glass>
  );
}

// ── Screen ────────────────────────────────────────────────────────
type Tab = 'overview' | 'splits' | 'progress' | 'server';

export default function DetailsScreen({ onBack }: DetailsScreenProps) {
  const { history, templates } = useAppState();
  const [tab, setTab] = useState<Tab>('overview');

  const weekAgo = Date.now() - 7 * DAY_MS;
  const thisWeek = history.filter((w) => new Date(w.date).getTime() >= weekAgo);
  const weekSets = thisWeek.reduce((n, w) => n + w.totalSets, 0);
  const weekVolume = thisWeek.reduce((n, w) => n + w.volume, 0);

  const overviewHeader = (
    <View>
      <Text style={styles.sectionLabel}>This week</Text>
      <View style={styles.statsRow}>
        <StatTile value={`${thisWeek.length}`} label="workouts" delay={0} />
        <StatTile value={`${weekSets}`} label="sets" delay={45} />
        <StatTile value={fmtVolume(weekVolume)} label="lbs moved" delay={90} />
      </View>

      <FadeIn delay={135}>
        <ScoreBar history={history} />
      </FadeIn>

      <FadeIn delay={180}>
        <VolumeChart history={history} />
      </FadeIn>

      <Text style={styles.sectionLabel}>Training days</Text>
      <FadeIn delay={225}>
        <Glass style={styles.gridCard}>
          <TrainingGrid history={history} />
        </Glass>
      </FadeIn>

      <Text style={styles.sectionLabel}>History</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.backChip} interactive>
          <Text style={styles.backText}>‹ Home</Text>
        </Glass>
      </Pressable>
      <Text style={styles.title}>Details</Text>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(
          [
            ['overview', 'Overview'],
            ['splits', 'Splits'],
            ['progress', 'Progress'],
            ['server', 'Server'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              tick();
              setTab(key);
            }}
            style={{ flex: 1 }}
          >
            <Glass style={[styles.tabChip, tab === key && styles.tabChipActive]} interactive>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Glass>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        <FlatList
          data={history}
          keyExtractor={(w, i) => `${w.date}-${i}`}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={overviewHeader}
          renderItem={({ item, index }) => (
            <HistoryCard workout={item} delay={270 + Math.min(index, 5) * 45} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No workouts yet</Text>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {tab === 'splits' ? (
            <SplitsTab templates={templates} />
          ) : tab === 'progress' ? (
            <ProgressTab history={history} />
          ) : (
            <ServerTab />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  backWrap: {
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  backChip: {
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 14,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  tabChip: {
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabChipActive: {},
  tabText: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.accent,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statTile: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 11,
    marginTop: 3,
  },
  scoreCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreValue: {
    color: theme.accent,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoreTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.accent,
  },
  scoreHint: {
    color: theme.textDim,
    fontSize: 11,
    marginTop: 10,
  },
  chartCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  chartTitle: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chartArea: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartValue: {
    color: theme.textDim,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
    height: 14,
  },
  chartBarTrack: {
    height: 90,
    width: '100%',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: theme.accent,
  },
  chartLabel: {
    color: theme.textDim,
    fontSize: 11,
    marginTop: 6,
  },
  gridCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridCol: {
    gap: 4,
  },
  gridCell: {
    width: 15,
    height: 15,
    borderRadius: 4,
  },
  gridCellEmpty: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  gridCellLow: {
    backgroundColor: theme.accentDeep,
  },
  gridCellMid: {
    backgroundColor: '#23A24A',
  },
  gridCellHigh: {
    backgroundColor: theme.accent,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  editedTag: {
    color: theme.accent,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  standardTag: {
    color: theme.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    opacity: 0.6,
  },
  cardDate: {
    color: theme.textDim,
    fontSize: 13,
  },
  cardSub: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: 10,
  },
  cardStat: {
    color: theme.textDim,
    fontSize: 13,
  },
  cardStatValue: {
    color: theme.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    color: theme.textDim,
    fontSize: 14,
  },
  // splits tab
  splitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  freqChip: {
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  freqChipActive: {
    backgroundColor: 'rgba(35,162,74,0.25)',
    borderColor: theme.accent,
  },
  freqText: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  freqTextActive: {
    color: theme.text,
  },
  freqScore: {
    marginLeft: 'auto',
    alignItems: 'center',
  },
  freqScoreValue: {
    color: theme.accent,
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  freqScoreLabel: {
    color: theme.textDim,
    fontSize: 10,
  },
  analysisCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  muscleRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  muscleName: {
    color: theme.text,
    fontSize: 13,
    width: 108,
  },
  muscleTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  muscleFill: {
    height: '100%',
    borderRadius: 4,
  },
  muscleNet: {
    color: theme.textDim,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 28,
    textAlign: 'right',
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  // progress tab
  progressRowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  progressDelta: {
    fontSize: 12,
    marginLeft: 'auto',
  },
  deltaUp: {
    color: theme.accent,
  },
  deltaDown: {
    color: theme.textDim,
  },
  progressBest: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 92,
    textAlign: 'right',
  },
  progressBestDim: {
    color: theme.textDim,
    fontWeight: '400',
  },
});
