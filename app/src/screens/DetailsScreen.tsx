import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppState } from '../state/AppState';
import { rollingNet, stimulusScore } from '../analysis/stimulus';
import { useAccountState } from '../state/AccountState';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';
import ProgressTab from '../components/details/ProgressTab';
import SplitsTab from '../components/details/SplitsTab';
import HistoryTab from '../components/details/HistoryTab';

interface DetailsScreenProps {
  onBack: () => void;
}

const DAY_MS = 86_400_000;
const tick = () => Haptics.selectionAsync().catch(() => {});

interface OverviewWorkout {
  id: string;
  date: string;
  totalSets: number;
  volume: number;
}

function fmtVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
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
function VolumeChart({ history }: { history: OverviewWorkout[] }) {
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
function ScoreBar({ score, loading }: { score: number | null; loading: boolean }) {
  return (
    <Glass style={styles.scoreCard}>
      <View style={styles.scoreHeader}>
        <Text style={styles.chartTitle}>Stimulus score</Text>
        <Text style={styles.scoreValue}>{score ?? '—'}</Text>
      </View>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${Math.min(100, score ?? 0)}%` }]} />
      </View>
      <Text style={styles.scoreHint}>
        {loading ? 'Loading account stimulus…' : 'trained muscles at a productive weekly dose'}
      </Text>
    </Glass>
  );
}

// ── GitHub-style training grid (last 15 weeks) ────────────────────
const GRID_WEEKS = 15;

function TrainingGrid({ history }: { history: OverviewWorkout[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of history) {
      const d = new Date(w.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, (map.get(key) ?? 0) + w.volume);
    }
    return map;
  }, [history]);

  // Walk calendar days (not fixed 24h ticks) so DST transitions don't shift
  // a column of cells onto the wrong day.
  const dayKeys = useMemo(() => {
    const keys: string[] = [];
    const d = new Date();
    for (let i = 0; i < GRID_WEEKS * 7; i++) {
      keys.push(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      d.setDate(d.getDate() - 1);
    }
    return keys; // index = daysAgo
  }, []);

  const cellFor = (daysAgo: number) => {
    const key = dayKeys[daysAgo] ?? '';
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

function OverviewNotice({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <FadeIn>
      <Glass style={styles.notice}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
        {action && onAction && (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.noticeAction}>{action}</Text>
          </Pressable>
        )}
      </Glass>
    </FadeIn>
  );
}

// ── Screen ────────────────────────────────────────────────────────
type Tab = 'overview' | 'splits' | 'progress' | 'history';

export default function DetailsScreen({ onBack }: DetailsScreenProps) {
  const { history, templates } = useAppState();
  const account = useAccountState();
  const [tab, setTab] = useState<Tab>('overview');
  const overviewRange = account.workoutOverview;
  const accountMode = account.status === 'authenticated';
  const demoMode = account.status === 'signedOut' || account.status === 'unconfigured';

  useEffect(() => {
    if (account.status === 'authenticated') account.ensureWorkoutOverview();
  }, [account.status, account.ensureWorkoutOverview]);

  const remoteOverviewHistory = useMemo<OverviewWorkout[]>(
    () =>
      overviewRange.data.map((workout) => ({
        id: workout.id,
        date: workout.completed_at,
        totalSets: workout.total_sets,
        volume: workout.total_volume,
      })),
    [overviewRange.data]
  );
  const localOverviewHistory = useMemo<OverviewWorkout[]>(
    () =>
      history.map((workout, index) => ({
        id: workout.localId ?? workout.remoteId ?? `${workout.date}-${index}`,
        date: workout.date,
        totalSets: workout.totalSets,
        volume: workout.volume,
      })),
    [history]
  );
  const overviewHistory = accountMode
    ? remoteOverviewHistory
    : demoMode
      ? localOverviewHistory
      : [];

  const overviewScore = useMemo(() => {
    if (accountMode) {
      return account.recentStimulus.loaded && account.recentStimulus.data
        ? stimulusScore(account.recentStimulus.data.muscles)
        : null;
    }
    if (!demoMode) return null;
    const now = Date.now();
    return stimulusScore(
      rollingNet(
        history.map((workout) => ({
          stimulus: workout.stimulus,
          daysAgo: (now - new Date(workout.date).getTime()) / DAY_MS,
        }))
      )
    );
  }, [accountMode, account.recentStimulus, demoMode, history]);

  const weekAgo = Date.now() - 7 * DAY_MS;
  const thisWeek = overviewHistory.filter((w) => new Date(w.date).getTime() >= weekAgo);
  const weekSets = thisWeek.reduce((n, w) => n + w.totalSets, 0);
  const weekVolume = thisWeek.reduce((n, w) => n + w.volume, 0);

  const overviewLoading =
    account.status === 'checking' ||
    (accountMode && !overviewRange.loaded && !overviewRange.error);
  const overviewError =
    account.status === 'error'
      ? account.sessionError ?? 'Could not verify your account.'
      : accountMode
        ? overviewRange.error
        : null;
  const stimulusLoading =
    accountMode && !account.recentStimulus.loaded && !account.recentStimulus.error;

  const overviewContent = overviewLoading ? (
    <OverviewNotice
      title="Loading overview"
      body="Fetching your account workout history and stimulus analysis…"
    />
  ) : overviewError ? (
    <OverviewNotice
      title="Overview could not load"
      body={`${overviewError} Local workout history was not substituted.`}
      action="Retry"
      onAction={
        account.status === 'error'
          ? account.refreshSession
          : account.refreshWorkoutOverview
      }
    />
  ) : (
    <View>
      {demoMode && (
        <OverviewNotice
          title="Demo overview"
          body="Sign in to replace device-local sessions with your account workout history."
        />
      )}
      {accountMode && overviewRange.loaded && overviewHistory.length === 0 && (
        <OverviewNotice
          title="No account workouts yet"
          body="Finish a workout and it will appear in these overview visuals."
        />
      )}
      <Text style={styles.sectionLabel}>This week</Text>
      <View style={styles.statsRow}>
        <StatTile value={`${thisWeek.length}`} label="workouts" delay={0} />
        <StatTile value={`${weekSets}`} label="sets" delay={45} />
        <StatTile value={fmtVolume(weekVolume)} label="lbs moved" delay={90} />
      </View>

      {accountMode && account.recentStimulus.error && (
        <OverviewNotice
          title="Stimulus score could not load"
          body={account.recentStimulus.error}
          action="Retry"
          onAction={account.refreshStimulus}
        />
      )}
      <FadeIn delay={135}>
        <ScoreBar score={overviewScore} loading={stimulusLoading} />
      </FadeIn>

      <FadeIn delay={180}>
        <VolumeChart history={overviewHistory} />
      </FadeIn>

      <Text style={styles.sectionLabel}>Training days</Text>
      <FadeIn delay={225}>
        <Glass style={styles.gridCard}>
          <TrainingGrid history={overviewHistory} />
        </Glass>
      </FadeIn>
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
            ['history', 'History'],
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {overviewContent}
        </ScrollView>
      ) : tab === 'history' ? (
        <HistoryTab />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {tab === 'splits' ? (
            <SplitsTab templates={templates} />
          ) : (
            <ProgressTab history={history} templates={templates} />
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
  notice: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  noticeTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 5,
  },
  noticeBody: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  noticeAction: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
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
});
