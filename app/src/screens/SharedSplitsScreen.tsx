import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Friendship, SplitShare, social } from '../api/backend';
import { MUSCLE_REGIONS } from '../data/muscleRegions.gen';
import { theme } from '../theme';
import Glass from '../ui/Glass';

interface SharedSplitsScreenProps {
  friend: Friendship;
  onBack: () => void;
}

function SharedSplitCard({ share }: { share: SplitShare }) {
  const [expanded, setExpanded] = useState(false);
  const [copying, setCopying] = useState(false);
  const [saved, setSaved] = useState(false);
  const sessions = share.split_version.sessions ?? [];
  const exerciseCount = sessions.reduce((total, session) => total + session.exercises.length, 0);
  const topRegions = useMemo(
    () => [...(share.analysis_version?.muscles ?? [])]
      .sort((a, b) => b.net_stimulus - a.net_stimulus)
      .slice(0, 5),
    [share.analysis_version]
  );

  const copy = async () => {
    setCopying(true);
    try {
      await social.copySplit(share.id);
      setSaved(true);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Glass style={styles.splitCard}>
      <Pressable onPress={() => setExpanded((value) => !value)}>
        <View style={styles.splitHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.splitName}>{share.split_name}</Text>
            <Text style={styles.meta}>
              {sessions.length} days · {exerciseCount} exercises · immutable version
            </Text>
          </View>
          <Text style={styles.expand}>{expanded ? '−' : '+'}</Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.analysis}>
          {sessions.map((session) => (
            <View key={`${session.day_number}-${session.name}`} style={styles.sessionRow}>
              <Text style={styles.day}>DAY {session.day_number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionName}>{session.name}</Text>
                <Text style={styles.exerciseNames} numberOfLines={2}>
                  {session.exercises.map((exercise) => `${exercise.name} × ${exercise.sets}`).join(' · ') || 'Rest day'}
                </Text>
              </View>
            </View>
          ))}
          {topRegions.length > 0 && (
            <View style={styles.topStimulus}>
              <Text style={styles.analysisLabel}>TOP STIMULUS</Text>
              {topRegions.map((muscle) => (
                <View key={muscle.region_id} style={styles.muscleRow}>
                  <Text style={styles.muscleName}>
                    {MUSCLE_REGIONS[muscle.region_id]?.displayName ?? muscle.display_name}
                  </Text>
                  <Text style={styles.muscleValue}>{muscle.net_stimulus.toFixed(1)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Pressable onPress={copy} disabled={copying || saved} style={[styles.copyButton, saved && styles.copySaved]}>
        <Text style={[styles.copyText, saved && styles.copySavedText]}>
          {saved ? 'Saved to My Splits ✓' : copying ? 'Saving…' : 'Save a copy to My Splits'}
        </Text>
      </Pressable>
      <Text style={styles.published}>
        Published {new Date(share.published_at).toLocaleDateString()}
      </Text>
    </Glass>
  );
}

export default function SharedSplitsScreen({ friend, onBack }: SharedSplitsScreenProps) {
  const [shares, setShares] = useState<SplitShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    social.sharedSplits(friend.friend_id)
      .then((response) => setShares(response.shares))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Shared splits unavailable.'));
  }, [friend.friend_id]);

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.navChip} interactive><Text style={styles.navText}>‹ {friend.profile.display_name}</Text></Glass>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>PUBLISHED VERSIONS</Text>
        <Text style={styles.title}>Shared splits</Text>
        <Text style={styles.subtitle}>
          Saving creates your own editable copy. Future changes to the original won’t alter it.
        </Text>
        {shares === null && !error && <ActivityIndicator color={theme.accent} style={styles.loader} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {shares?.length === 0 && (
          <Glass style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing shared yet</Text>
            <Text style={styles.emptyText}>{friend.profile.display_name} has no visible published splits.</Text>
          </Glass>
        )}
        {shares?.map((share) => <SharedSplitCard key={share.id} share={share} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  backWrap: { position: 'absolute', top: 56, left: 20, zIndex: 4 },
  navChip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  navText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  content: { paddingTop: 112, paddingHorizontal: 20, paddingBottom: 50, maxWidth: 680, width: '100%', alignSelf: 'center' },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.text, fontSize: 31, fontWeight: '800', marginTop: 5 },
  subtitle: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  loader: { marginTop: 80 },
  splitCard: { borderRadius: 25, padding: 18, marginBottom: 14 },
  splitHeader: { flexDirection: 'row', alignItems: 'center' },
  splitName: { color: theme.text, fontSize: 18, fontWeight: '800' },
  meta: { color: theme.textDim, fontSize: 11, marginTop: 5 },
  expand: { color: theme.textDim, fontSize: 24, paddingLeft: 12 },
  analysis: { marginTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 8 },
  sessionRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  day: { color: theme.accent, fontSize: 9, fontWeight: '800', width: 42, paddingTop: 2 },
  sessionName: { color: theme.text, fontSize: 13, fontWeight: '700' },
  exerciseNames: { color: theme.textDim, fontSize: 10, lineHeight: 15, marginTop: 3 },
  topStimulus: { paddingTop: 14 },
  analysisLabel: { color: theme.textDim, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginBottom: 5 },
  muscleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  muscleName: { color: theme.text, fontSize: 12 },
  muscleValue: { color: theme.accent, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  copyButton: { backgroundColor: theme.accent, borderRadius: 16, alignItems: 'center', paddingVertical: 12, marginTop: 17 },
  copySaved: { backgroundColor: 'rgba(65,196,110,0.13)', borderWidth: 1, borderColor: theme.accentDeep },
  copyText: { color: '#07150b', fontSize: 13, fontWeight: '800' },
  copySavedText: { color: theme.accent },
  published: { color: theme.textDim, fontSize: 9, textAlign: 'center', marginTop: 9 },
  emptyCard: { borderRadius: 24, padding: 20 },
  emptyTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: theme.textDim, fontSize: 13, marginTop: 6 },
  error: { color: '#E27878', fontSize: 13, marginTop: 20 },
});
