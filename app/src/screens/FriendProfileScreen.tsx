import React, { Suspense, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FriendActivity, Friendship, SocialSnapshot, social } from '../api/backend';
import { levelsFromNet } from '../analysis/stimulus';
import { theme } from '../theme';
import Glass from '../ui/Glass';

const BodyHeatmap = React.lazy(() => import('../3d/BodyHeatmap'));

interface FriendProfileScreenProps {
  friend: Friendship;
  onBack: () => void;
  onCompare: () => void;
  onSharedSplits: () => void;
  onRemoved: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FriendProfileScreen({
  friend,
  onBack,
  onCompare,
  onSharedSplits,
  onRemoved,
}: FriendProfileScreenProps) {
  const { width } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<SocialSnapshot | null>(null);
  const [friendActivity, setFriendActivity] = useState<FriendActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      social.snapshot(friend.friend_id),
      social.activity(friend.friend_id),
    ]).then(([snapshotResult, activityResult]) => {
      if (!live) return;
      if (snapshotResult.status === 'fulfilled') {
        setSnapshot(snapshotResult.value);
      } else {
        setError(
          snapshotResult.reason instanceof Error
            ? snapshotResult.reason.message
            : 'Snapshot unavailable.'
        );
      }
      if (activityResult.status === 'fulfilled') setFriendActivity(activityResult.value);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [friend.friend_id]);

  const endFriendship = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'block') await social.block(friend.friend_id);
      else await social.remove(friend.friend_id);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Friendship could not be updated.');
      setBusy(false);
      setConfirm(null);
    }
  };

  const activity = friendActivity?.weekly_activity;
  const liftTrends = friendActivity?.lift_trends ?? [];
  const mapWidth = Math.min(width - 40, 430);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Glass style={styles.navChip} interactive><Text style={styles.navText}>‹ Friends</Text></Glass>
        </Pressable>
        <Pressable onPress={() => setConfirm('remove')} hitSlop={8}>
          <Text style={styles.moreText}>Manage</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{friend.profile.handle[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>@{friend.profile.handle}</Text>
        </View>

        {loading && <ActivityIndicator color={theme.accent} style={styles.loader} />}
        {!loading && snapshot && (
          <Glass style={styles.bodyCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Current Stimulus Body</Text>
                  <Text style={styles.meta}>
                    {formatDate(snapshot.calculation_window_start)}–{formatDate(snapshot.calculation_window_end)}
                  </Text>
                </View>
                <View style={styles.liveBadge}><Text style={styles.liveText}>SHARED</Text></View>
              </View>
              <View style={[styles.bodyWrap, { width: mapWidth }]}>
                <Suspense fallback={<ActivityIndicator color={theme.accent} />}>
                  <BodyHeatmap
                    width={mapWidth}
                    height={390}
                    stimulusLevels={levelsFromNet(snapshot.region_stimulus)}
                  />
                </Suspense>
              </View>
              <Text style={styles.updated}>Updated {new Date(snapshot.published_at).toLocaleString()}</Text>
          </Glass>
        )}
        {!loading && !snapshot && (
          <Glass style={styles.emptyCard}>
            <Text style={styles.cardTitle}>Stimulus Body is private</Text>
            <Text style={styles.emptyText}>
              {error ?? `@${friend.profile.handle} has not published a snapshot yet.`}
            </Text>
          </Glass>
        )}

        {!loading && (
          <>
            <View style={styles.actionRow}>
              <Pressable
                onPress={onCompare}
                disabled={!snapshot}
                style={[styles.primaryAction, !snapshot && styles.disabledAction]}
              >
                <Text style={styles.primaryActionText}>Compare</Text>
              </Pressable>
              <Pressable onPress={onSharedSplits} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Shared splits</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeading}>This week</Text>
            <Glass style={styles.activityCard}>
              {activity ? (
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{activity.workouts_completed}</Text>
                    <Text style={styles.statLabel}>Workouts</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{activity.consistency_percent}%</Text>
                    <Text style={styles.statLabel}>Consistency</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {activity.snapshot_date ? formatDate(activity.snapshot_date) : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Last snapshot</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.emptyText}>Weekly activity is private.</Text>
              )}
            </Glass>

            {liftTrends.length > 0 && (
              <>
                <Text style={styles.sectionHeading}>Selected lift trends</Text>
                <Glass style={styles.trendsCard}>
                  {liftTrends.map((trend) => (
                    <View key={trend.id} style={styles.trendRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.trendName}>{trend.exercise_name}</Text>
                        <Text style={styles.meta}>{trend.period_label}</Text>
                      </View>
                      <Text style={[styles.trendValue, trend.change_percent < 0 && styles.negative]}>
                        {trend.change_percent > 0 ? '+' : ''}{trend.change_percent.toFixed(1)}%
                      </Text>
                    </View>
                  ))}
                </Glass>
              </>
            )}
          </>
        )}
      </ScrollView>

      {confirm && (
        <View style={styles.confirmOverlay}>
          <Glass style={styles.confirmCard}>
            <Text style={styles.cardTitle}>
              {confirm === 'block' ? `Block @${friend.profile.handle}?` : 'Remove friend?'}
            </Text>
            <Text style={styles.emptyText}>
              Shared snapshots and splits disappear immediately.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirm(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={endFriendship} disabled={busy}>
                <Text style={styles.dangerText}>{busy ? 'Updating…' : confirm === 'block' ? 'Block' : 'Remove'}</Text>
              </Pressable>
            </View>
            {confirm === 'remove' && (
              <Pressable onPress={() => setConfirm('block')}><Text style={styles.blockInstead}>Block instead</Text></Pressable>
            )}
          </Glass>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  topBar: { position: 'absolute', top: 56, left: 20, right: 20, zIndex: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navChip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  navText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  moreText: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  content: { paddingTop: 112, paddingHorizontal: 20, paddingBottom: 50, maxWidth: 680, width: '100%', alignSelf: 'center' },
  identity: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(65,196,110,0.17)', borderWidth: 1, borderColor: 'rgba(65,196,110,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.accent, fontSize: 25, fontWeight: '800' },
  title: { color: theme.text, fontSize: 27, fontWeight: '800', marginTop: 12 },
  handle: { color: theme.textDim, fontSize: 13, marginTop: 3 },
  loader: { marginTop: 70 },
  bodyCard: { borderRadius: 28, paddingTop: 18, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  meta: { color: theme.textDim, fontSize: 11, marginTop: 3 },
  liveBadge: { borderRadius: 9, backgroundColor: 'rgba(65,196,110,0.13)', paddingHorizontal: 8, paddingVertical: 5 },
  liveText: { color: theme.accent, fontSize: 8, letterSpacing: 1, fontWeight: '800' },
  bodyWrap: { height: 390, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  updated: { color: theme.textDim, fontSize: 10, textAlign: 'center', paddingBottom: 15 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 22 },
  primaryAction: { flex: 1, backgroundColor: theme.accent, borderRadius: 17, paddingVertical: 13, alignItems: 'center' },
  disabledAction: { opacity: 0.4 },
  primaryActionText: { color: '#07150b', fontSize: 14, fontWeight: '800' },
  secondaryButton: { flex: 1, backgroundColor: theme.surfaceHigh, borderRadius: 17, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  secondaryButtonText: { color: theme.text, fontSize: 14, fontWeight: '700' },
  sectionHeading: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginLeft: 4, marginBottom: 8 },
  activityCard: { borderRadius: 23, padding: 17, marginBottom: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: theme.text, fontSize: 19, fontWeight: '800' },
  statLabel: { color: theme.textDim, fontSize: 9, marginTop: 4 },
  divider: { height: 32, width: StyleSheet.hairlineWidth, backgroundColor: theme.border },
  emptyText: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginTop: 7 },
  trendsCard: { borderRadius: 23, paddingHorizontal: 16 },
  trendRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  trendName: { color: theme.text, fontSize: 14, fontWeight: '700' },
  trendValue: { color: theme.accent, fontSize: 15, fontWeight: '800' },
  negative: { color: '#E27878' },
  emptyCard: { borderRadius: 24, padding: 20 },
  confirmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 10, alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 380, borderRadius: 25, padding: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 20 },
  cancelText: { color: theme.textDim, fontSize: 14, fontWeight: '700' },
  dangerText: { color: '#E27878', fontSize: 14, fontWeight: '800' },
  blockInstead: { color: '#E27878', opacity: 0.75, fontSize: 12, textAlign: 'center', marginTop: 18 },
});
