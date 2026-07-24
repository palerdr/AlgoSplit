import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Friendship, SocialComparison, social } from '../api/backend';
import { levelsFromNet } from '../analysis/stimulus';
import { MUSCLE_REGIONS } from '../data/muscleRegions.gen';
import { theme } from '../theme';
import Glass from '../ui/Glass';

const BodyHeatmap = React.lazy(() => import('../3d/BodyHeatmap'));

interface CompareFriendScreenProps {
  friend: Friendship;
  onBack: () => void;
}

const STATE_COLOR = {
  ahead: theme.accent,
  behind: '#E7A24B',
  similar: '#8A96A8',
} as const;

export default function CompareFriendScreen({ friend, onBack }: CompareFriendScreenProps) {
  const { width } = useWindowDimensions();
  const [comparison, setComparison] = useState<SocialComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    social.compare(friend.friend_id)
      .then(setComparison)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Comparison unavailable.'));
  }, [friend.friend_id]);

  const meaningful = useMemo(
    () => comparison?.regions
      .filter((region) => region.state !== 'similar')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) ?? [],
    [comparison]
  );
  const mapWidth = Math.max(145, Math.min(220, (width - 48) / 2));

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.navChip} interactive><Text style={styles.navText}>‹ @{friend.profile.handle}</Text></Glass>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>COMPARE</Text>
        <Text style={styles.title}>Me vs. @{friend.profile.handle}</Text>
        <Text style={styles.subtitle}>Differences use each person’s latest published calculation window.</Text>

        {!comparison && !error && <ActivityIndicator color={theme.accent} style={styles.loader} />}
        {error && (
          <Glass style={styles.errorCard}>
            <Text style={styles.cardTitle}>Comparison unavailable</Text>
            <Text style={styles.body}>{error}</Text>
          </Glass>
        )}
        {comparison && (
          <>
            <View style={styles.mapsRow}>
              <Glass style={[styles.mapCard, { width: mapWidth }]}>
                <Text style={styles.mapName}>Me</Text>
                <Suspense fallback={<ActivityIndicator color={theme.accent} />}>
                  <BodyHeatmap
                    width={mapWidth}
                    height={310}
                    stimulusLevels={levelsFromNet(comparison.me.region_stimulus)}
                  />
                </Suspense>
              </Glass>
              <Glass style={[styles.mapCard, { width: mapWidth }]}>
                <Text style={styles.mapName}>@{friend.profile.handle}</Text>
                <Suspense fallback={<ActivityIndicator color={theme.accent} />}>
                  <BodyHeatmap
                    width={mapWidth}
                    height={310}
                    stimulusLevels={levelsFromNet(comparison.friend.region_stimulus)}
                  />
                </Suspense>
              </Glass>
            </View>

            <Glass style={styles.summaryCard}>
              <View style={styles.summaryCounts}>
                {(['ahead', 'similar', 'behind'] as const).map((state) => (
                  <View key={state} style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: STATE_COLOR[state] }]}>
                      {state === 'ahead'
                        ? comparison.ahead_count
                        : state === 'behind'
                          ? comparison.behind_count
                          : comparison.similar_count}
                    </Text>
                    <Text style={styles.summaryLabel}>{state}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.explanation}>{comparison.explanation}</Text>
              <Text style={styles.thresholdNote}>
                Similar means within 0.5 stimulus or 10% of the larger value.
              </Text>
            </Glass>

            <Text style={styles.sectionHeading}>Meaningful differences</Text>
            <Glass style={styles.differencesCard}>
              {meaningful.length === 0 ? (
                <Text style={styles.body}>All 29 regions are meaningfully similar.</Text>
              ) : (
                meaningful.map((region) => (
                  <View key={region.region_id} style={styles.regionRow}>
                    <View style={[styles.stateDot, { backgroundColor: STATE_COLOR[region.state] }]} />
                    <View style={styles.regionCopy}>
                      <Text style={styles.regionName}>
                        {MUSCLE_REGIONS[region.region_id]?.displayName ?? region.region_id}
                      </Text>
                      <Text style={styles.regionValues}>
                        Me {region.me.toFixed(1)} · Friend {region.friend.toFixed(1)}
                      </Text>
                    </View>
                    <Text style={[styles.delta, { color: STATE_COLOR[region.state] }]}>
                      {region.delta > 0 ? '+' : ''}{region.delta.toFixed(1)}
                    </Text>
                  </View>
                ))
              )}
            </Glass>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  backWrap: { position: 'absolute', top: 56, left: 20, zIndex: 4 },
  navChip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  navText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  content: { paddingTop: 112, paddingHorizontal: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, paddingHorizontal: 4 },
  title: { color: theme.text, fontSize: 29, fontWeight: '800', marginTop: 5, paddingHorizontal: 4 },
  subtitle: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18, paddingHorizontal: 4 },
  loader: { marginTop: 80 },
  mapsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  mapCard: { height: 355, borderRadius: 24, overflow: 'hidden', alignItems: 'center' },
  mapName: { color: theme.text, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: -4, zIndex: 2 },
  summaryCard: { borderRadius: 24, padding: 18, marginTop: 10, marginBottom: 20 },
  summaryCounts: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: theme.textDim, fontSize: 10, textTransform: 'capitalize', marginTop: 2 },
  explanation: { color: theme.text, fontSize: 14, lineHeight: 21 },
  thresholdNote: { color: theme.textDim, fontSize: 10, lineHeight: 15, marginTop: 9 },
  sectionHeading: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginLeft: 5, marginBottom: 8 },
  differencesCard: { borderRadius: 24, paddingHorizontal: 16 },
  regionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  stateDot: { width: 8, height: 8, borderRadius: 4, marginRight: 11 },
  regionCopy: { flex: 1 },
  regionName: { color: theme.text, fontSize: 14, fontWeight: '700' },
  regionValues: { color: theme.textDim, fontSize: 10, marginTop: 3 },
  delta: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  errorCard: { borderRadius: 24, padding: 20, marginTop: 28 },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  body: { color: theme.textDim, fontSize: 13, lineHeight: 19, paddingVertical: 16 },
});
