import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  FriendVisibility,
  Friendship,
  SocialProfile,
  SocialSnapshot,
  social,
} from '../api/backend';
import { theme } from '../theme';
import FadeIn from '../ui/FadeIn';
import Glass from '../ui/Glass';
import { useAccountState } from '../state/AccountState';
import { useAppState } from '../state/AppState';
import {
  isProfileNotCreated,
  isValidUsername,
  normalizeUsername,
  socialApiUnavailableMessage,
} from '../social/usernames';
import { friendInviteShareContent } from '../social/friendInviteLink';
import {
  liftTrendCandidates,
  localDateKey,
  weeklyActivityPublication,
} from '../social/publishing';

interface FriendsScreenProps {
  onBack: () => void;
  onFriend: (friend: Friendship) => void;
  invitedHandle?: string | null;
  onInviteHandled?: (handle: string) => void;
}

const DEFAULT_VISIBILITY: FriendVisibility = {
  stimulus_body: true,
  weekly_activity: false,
  lift_progress: false,
  shared_splits: true,
};

function Avatar({ profile, size = 46 }: { profile: SocialProfile; size?: number }) {
  const initials = profile.handle.slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials || '?'}</Text>
    </View>
  );
}

function PersonRow({
  item,
  action,
  secondaryAction,
  onPress,
}: {
  item: Friendship;
  action?: { label: string; onPress?: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onPress: () => void; disabled?: boolean };
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.personRow}>
      <Avatar profile={item.profile} />
      <View style={styles.personCopy}>
        <Text style={styles.personName}>@{item.profile.handle}</Text>
      </View>
      {secondaryAction && (
        <Pressable
          onPress={secondaryAction.onPress}
          disabled={secondaryAction.disabled}
          hitSlop={8}
        >
          <Text style={styles.secondaryAction}>{secondaryAction.label}</Text>
        </Pressable>
      )}
      {action?.onPress ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          style={styles.smallAction}
        >
          <Text style={styles.smallActionText}>{action.label}</Text>
        </Pressable>
      ) : action ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{action.label}</Text>
        </View>
      ) : null}
      {onPress && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export default function FriendsScreen({
  onBack,
  onFriend,
  invitedHandle = null,
  onInviteHandled,
}: FriendsScreenProps) {
  const account = useAccountState();
  const app = useAppState();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [handle, setHandle] = useState('');
  const [visibility, setVisibility] = useState<FriendVisibility>(DEFAULT_VISIBILITY);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [outgoing, setOutgoing] = useState<Friendship[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<SocialProfile | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<SocialSnapshot | null>(null);
  const [selectedLiftNames, setSelectedLiftNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>('load');
  const [message, setMessage] = useState<string | null>(null);
  const attemptedInviteRef = useRef<string | null>(null);
  const availableLiftTrends = useMemo(() => liftTrendCandidates(app.history), [app.history]);

  const load = useCallback(async () => {
    setBusy('load');
    setMessage(null);
    try {
      const ownProfile = await social.profile();
      setProfile(ownProfile);
      setHandle(ownProfile.handle);
      setProfileMissing(false);
      const [list, settings, published] = await Promise.all([
        social.friends(),
        social.visibility().catch(() => ({ ...DEFAULT_VISIBILITY })),
        social.currentSnapshot().catch(() => null),
      ]);
      setFriends(list.friends);
      setIncoming(list.incoming);
      setOutgoing(list.outgoing);
      setVisibility({
        stimulus_body: settings.stimulus_body,
        weekly_activity: settings.weekly_activity,
        lift_progress: settings.lift_progress,
        shared_splits: settings.shared_splits,
      });
      setCurrentSnapshot(published);
      setSelectedLiftNames(
        published?.lift_trends.map((trend) => trend.exercise_name).slice(0, 5) ?? []
      );
    } catch (cause) {
      if (isProfileNotCreated(cause)) {
        setProfileMissing(true);
      } else {
        setMessage(socialApiUnavailableMessage(cause));
      }
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
    void account.refreshStimulus();
    void account.ensureSplits();
  }, [load]);

  const lookupUsername = useCallback(async (
    value: string,
    fromInvite = false
  ) => {
    const normalized = normalizeUsername(value);
    if (!isValidUsername(normalized)) return;
    setBusy('search');
    setFound(null);
    setMessage(null);
    try {
      const result = await social.lookup(normalized);
      setFound(result);
      if (fromInvite) {
        setMessage(`@${result.handle} invited you. Tap Add to send a friend request.`);
        onInviteHandled?.(normalized);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Username not found.');
      const status = (cause as { status?: unknown } | null)?.status;
      if (fromInvite && typeof status === 'number' && status >= 400 && status < 500) {
        onInviteHandled?.(normalized);
      }
    } finally {
      setBusy(null);
    }
  }, [onInviteHandled]);

  useEffect(() => {
    const normalized = normalizeUsername(invitedHandle ?? '');
    if (
      !profile ||
      busy === 'load' ||
      !isValidUsername(normalized) ||
      attemptedInviteRef.current === normalized
    ) {
      return;
    }
    attemptedInviteRef.current = normalized;
    setQuery(normalized);
    void lookupUsername(normalized, true);
  }, [busy, invitedHandle, lookupUsername, profile]);

  const publishCurrentSnapshot = async () => {
    const analysis = account.recentStimulus.data;
    if (!analysis) {
      setMessage('Finish syncing your Stimulus Body before publishing.');
      return;
    }
    setBusy('snapshot');
    setMessage(null);
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    const liftSelection = new Set(selectedLiftNames);
    try {
      const published = await social.publishSnapshot({
        region_stimulus: Object.fromEntries(
          analysis.muscles.map((muscle) => [muscle.region_id, muscle.net_stimulus])
        ),
        calculation_window_start: localDateKey(start),
        calculation_window_end: localDateKey(now),
        calculation_settings: {
          stimulus_duration: analysis.stimulus_duration,
          maintenance_volume: analysis.maintenance_volume,
          dataset: analysis.dataset,
        },
        source_analysis_updated_at: account.recentStimulus.fetchedAt
          ? new Date(account.recentStimulus.fetchedAt).toISOString()
          : null,
        weekly_activity: weeklyActivityPublication(app.history, now),
        lift_trends: visibility.lift_progress
          ? availableLiftTrends
              .filter((trend) => liftSelection.has(trend.exercise_name))
              .slice(0, 5)
          : [],
      });
      setCurrentSnapshot(published);
      setMessage('A new sanitized Stimulus Body snapshot is now shared.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Snapshot could not be published.');
    } finally {
      setBusy(null);
    }
  };

  const publishSplit = async (splitId: string, splitName: string) => {
    setBusy(`split:${splitId}`);
    setMessage(null);
    try {
      await social.shareSplit(splitId);
      setMessage(`${splitName} was published as an immutable version.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Split could not be published.');
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    setBusy('profile');
    setMessage(null);
    try {
      const saved = await social.saveProfile({
        handle,
        discoverable: true,
      });
      setProfile(saved);
      setProfileMissing(false);
      await load();
      setMessage('Username ready. Friends can now find you by exact username.');
    } catch (cause) {
      setMessage(socialApiUnavailableMessage(cause));
      setBusy(null);
    }
  };

  const updateVisibility = async (key: keyof FriendVisibility, value: boolean) => {
    const next = { ...visibility, [key]: value };
    setVisibility(next);
    setBusy(`visibility:${key}`);
    try {
      await social.saveVisibility(next);
    } catch (cause) {
      setVisibility(visibility);
      setMessage(cause instanceof Error ? cause.message : 'Visibility could not be updated.');
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    await lookupUsername(query);
  };

  const sendRequest = async () => {
    if (!found || busy === 'request') return;
    setBusy('request');
    const requestedHandle = found.handle;
    try {
      await social.request(requestedHandle);
      setFound(null);
      setQuery('');
      await load();
      setMessage(`Request sent to @${requestedHandle}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Request could not be sent.');
      setBusy(null);
    }
  };

  const respond = async (item: Friendship, accept: boolean) => {
    setBusy(item.id);
    try {
      if (accept) await social.accept(item.id);
      else await social.decline(item.id);
      await load();
      setMessage(accept ? `You and @${item.profile.handle} are now friends.` : 'Request declined.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Request could not be updated.');
      setBusy(null);
    }
  };

  const shareInvite = async () => {
    if (!profile || busy === 'invite') return;
    setBusy('invite');
    setMessage(null);
    try {
      await Share.share(friendInviteShareContent(profile.handle));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Invite could not be shared.');
    } finally {
      setBusy(null);
    }
  };

  const toggleLiftSelection = (exerciseName: string, enabled: boolean) => {
    setSelectedLiftNames((current) => {
      if (!enabled) return current.filter((name) => name !== exerciseName);
      if (current.includes(exerciseName) || current.length >= 5) return current;
      return [...current, exerciseName];
    });
  };

  const visibilityRows: Array<[keyof FriendVisibility, string, string]> = [
    ['stimulus_body', 'Stimulus Body', 'Current sanitized 29-region snapshot'],
    ['weekly_activity', 'Weekly activity', 'Workouts and consistency only'],
    ['lift_progress', 'Selected lift trends', 'Only lifts you publish'],
    ['shared_splits', 'Shared splits', 'Immutable versions you publish'],
  ];

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.backChip} interactive>
          <Text style={styles.backText}>‹ Home</Text>
        </Glass>
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <Text style={styles.eyebrow}>SOCIAL</Text>
          <Text style={styles.title}>Friends</Text>
        </FadeIn>

        {busy === 'load' && !profile && !profileMissing ? (
          <ActivityIndicator color={theme.accent} style={styles.loader} />
        ) : profileMissing ? (
          <FadeIn delay={40}>
            <Glass style={styles.card}>
              <Text style={styles.cardTitle}>Create your friend profile</Text>
              <Text style={styles.cardBody}>
                Choose one unique username. Friends must enter it exactly; your email and workout
                history stay private.
              </Text>
              <TextInput
                value={handle}
                onChangeText={(value) => setHandle(normalizeUsername(value))}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Username"
                placeholderTextColor={theme.textDim}
                style={styles.input}
                maxLength={24}
              />
              <Text style={styles.inputHint}>3–24 letters, numbers, or underscores.</Text>
              <Pressable
                onPress={saveProfile}
                disabled={busy === 'profile' || !isValidUsername(handle)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {busy === 'profile' ? 'Saving…' : 'Create profile'}
                </Text>
              </Pressable>
            </Glass>
          </FadeIn>
        ) : profile ? (
          <>
            <FadeIn delay={35}>
              <Glass style={styles.profileCard}>
                <Avatar profile={profile} size={58} />
                <View style={styles.personCopy}>
                  <Text style={styles.profileName}>@{profile.handle}</Text>
                </View>
                <Pressable
                  onPress={shareInvite}
                  disabled={busy === 'invite'}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite someone to add @${profile.handle}`}
                  style={styles.inviteButton}
                >
                  <Text style={styles.inviteText}>
                    {busy === 'invite' ? 'Opening…' : 'Invite'}
                  </Text>
                </Pressable>
              </Glass>
            </FadeIn>

            <FadeIn delay={65}>
              <Glass style={styles.card}>
                <Text style={styles.sectionLabel}>FIND BY USERNAME</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    value={query}
                    onChangeText={(value) => {
                      setQuery(normalizeUsername(value));
                      setFound(null);
                    }}
                    onSubmitEditing={search}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="@username"
                    placeholderTextColor={theme.textDim}
                    style={[styles.input, styles.searchInput]}
                  />
                  <Pressable
                    onPress={search}
                    disabled={busy === 'search' || !isValidUsername(query)}
                    accessibilityRole="button"
                    accessibilityLabel="Find username"
                    style={[
                      styles.searchButton,
                      (busy === 'search' || !isValidUsername(query)) && styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.searchButtonText}>
                      {busy === 'search' ? '…' : 'Search'}
                    </Text>
                  </Pressable>
                </View>
                {found && (
                  <View style={styles.searchResult}>
                    <Avatar profile={found} />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>@{found.handle}</Text>
                    </View>
                    <Pressable
                      onPress={sendRequest}
                      disabled={busy === 'request'}
                      accessibilityRole="button"
                      accessibilityLabel={`Send friend request to @${found.handle}`}
                      style={styles.smallAction}
                    >
                      <Text style={styles.smallActionText}>
                        {busy === 'request' ? 'Sending…' : 'Add'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Glass>
            </FadeIn>

            {incoming.length > 0 && (
              <FadeIn delay={90}>
                <Text style={styles.sectionHeading}>Requests</Text>
                <Glass style={styles.listCard}>
                  {incoming.map((item) => (
                    <PersonRow
                      key={item.id}
                      item={item}
                      secondaryAction={{ label: 'Decline', onPress: () => respond(item, false) }}
                      action={{
                        label: busy === item.id ? '…' : 'Accept',
                        onPress: () => respond(item, true),
                        disabled: busy === item.id,
                      }}
                    />
                  ))}
                </Glass>
              </FadeIn>
            )}

            <FadeIn delay={110}>
              <Text style={styles.sectionHeading}>Your friends</Text>
              <Glass style={styles.listCard}>
                {friends.length === 0 ? (
                  <Text style={styles.emptyText}>
                    Add someone by their exact username. Friendship is mutual.
                  </Text>
                ) : (
                  friends.map((item) => (
                    <PersonRow key={item.id} item={item} onPress={() => onFriend(item)} />
                  ))
                )}
                {outgoing.map((item) => (
                  <PersonRow
                    key={item.id}
                    item={item}
                    action={{ label: 'Pending' }}
                  />
                ))}
              </Glass>
            </FadeIn>

            <FadeIn delay={135}>
              <Text style={styles.sectionHeading}>What friends can see</Text>
              <Glass style={styles.listCard}>
                {visibilityRows.map(([key, label, detail]) => (
                  <View key={key} style={styles.visibilityRow}>
                    <View style={styles.visibilityCopy}>
                      <Text style={styles.personName}>{label}</Text>
                      <Text style={styles.visibilityDetail}>{detail}</Text>
                    </View>
                    <View style={styles.visibilitySwitchSlot}>
                      <Switch
                        value={visibility[key]}
                        onValueChange={(value) => updateVisibility(key, value)}
                        disabled={busy?.startsWith('visibility:') ?? false}
                        accessibilityLabel={`Let friends see ${label}`}
                        trackColor={{ false: theme.border, true: theme.accentDeep }}
                        thumbColor={visibility[key] ? theme.accent : '#bbb'}
                      />
                    </View>
                  </View>
                ))}
              </Glass>
            </FadeIn>

            {visibility.lift_progress && (
              <FadeIn delay={145}>
                <Text style={styles.sectionHeading}>Choose lift trends</Text>
                <Glass style={styles.listCard}>
                  {availableLiftTrends.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Complete the same weighted exercise twice within eight weeks to publish a trend.
                    </Text>
                  ) : (
                    availableLiftTrends.slice(0, 8).map((trend) => {
                      const selected = selectedLiftNames.includes(trend.exercise_name);
                      return (
                        <View key={trend.exercise_name} style={styles.visibilityRow}>
                          <View style={styles.visibilityCopy}>
                            <Text style={styles.personName}>{trend.exercise_name}</Text>
                            <Text style={styles.visibilityDetail}>
                              {trend.change_percent > 0 ? '+' : ''}
                              {trend.change_percent.toFixed(1)}% · {trend.period_label}
                            </Text>
                          </View>
                          <View style={styles.visibilitySwitchSlot}>
                            <Switch
                              value={selected}
                              onValueChange={(value) =>
                                toggleLiftSelection(trend.exercise_name, value)
                              }
                              disabled={!selected && selectedLiftNames.length >= 5}
                              accessibilityLabel={`Publish ${trend.exercise_name} trend`}
                              trackColor={{ false: theme.border, true: theme.accentDeep }}
                              thumbColor={selected ? theme.accent : '#bbb'}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}
                  {availableLiftTrends.length > 0 && (
                    <Text style={styles.selectionNote}>
                      Select up to five. Only the derived percentage and period are published.
                    </Text>
                  )}
                </Glass>
              </FadeIn>
            )}

            <FadeIn delay={155}>
              <Text style={styles.sectionHeading}>Publish current snapshot</Text>
              <Glass style={styles.publishCard}>
                <Text style={styles.personName}>Share a fresh Stimulus Body</Text>
                <Text style={styles.visibilityDetail}>
                  Publishes only the 29 derived region values and calculation window—never workout rows.
                </Text>
                {currentSnapshot && (
                  <Text style={styles.publishedStatus}>
                    Currently shared · updated {new Date(currentSnapshot.published_at).toLocaleString()}
                    {'\n'}
                    Window {currentSnapshot.calculation_window_start}–{currentSnapshot.calculation_window_end}
                  </Text>
                )}
                <Pressable
                  onPress={publishCurrentSnapshot}
                  disabled={busy === 'snapshot' || !account.recentStimulus.data}
                  accessibilityRole="button"
                  accessibilityLabel="Publish current social snapshot"
                  style={[
                    styles.publishButton,
                    (busy === 'snapshot' || !account.recentStimulus.data) && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.publishButtonText}>
                    {busy === 'snapshot'
                      ? 'Publishing…'
                      : account.recentStimulus.data
                        ? currentSnapshot
                          ? 'Publish updated snapshot'
                          : 'Publish current snapshot'
                        : 'Stimulus Body unavailable'}
                  </Text>
                </Pressable>
              </Glass>
            </FadeIn>

            {account.splits.data.length > 0 && (
              <FadeIn delay={175}>
                <Text style={styles.sectionHeading}>Publish a split</Text>
                <Glass style={styles.listCard}>
                  {account.splits.data.map((split) => (
                    <View key={split.id} style={styles.visibilityRow}>
                      <View style={styles.visibilityCopy}>
                        <Text style={styles.personName}>{split.name}</Text>
                        <Text style={styles.visibilityDetail}>
                          {split.sessions.length} days · immutable copy
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => publishSplit(split.id, split.name)}
                        disabled={busy === `split:${split.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Publish ${split.name} to friends`}
                        style={styles.smallAction}
                      >
                        <Text style={styles.smallActionText}>
                          {busy === `split:${split.id}` ? '…' : 'Publish'}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </Glass>
              </FadeIn>
            )}
          </>
        ) : null}

        {message && <Text style={styles.message}>{message}</Text>}
        <Text style={styles.privacyNote}>
          Never shared by default: raw workouts, bodyweight, exact training times, email, or private notes.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 112, paddingBottom: 48, maxWidth: 680, width: '100%', alignSelf: 'center' },
  backWrap: { position: 'absolute', top: 58, left: 20, zIndex: 4 },
  backChip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  backText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: theme.text, fontSize: 34, lineHeight: 40, fontWeight: '800', marginTop: 5, marginBottom: 22 },
  loader: { marginTop: 60 },
  card: { borderRadius: 24, padding: 18, marginBottom: 16 },
  profileCard: { borderRadius: 24, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  cardTitle: { color: theme.text, fontSize: 19, fontWeight: '700', marginBottom: 6 },
  cardBody: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  profileName: { color: theme.text, fontSize: 18, fontWeight: '700' },
  avatar: { backgroundColor: 'rgba(65,196,110,0.17)', borderWidth: 1, borderColor: 'rgba(65,196,110,0.35)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.accent, fontWeight: '800' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: theme.text, fontSize: 15, fontWeight: '700' },
  handle: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  inviteButton: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 9 },
  inviteText: { color: theme.text, fontSize: 13, fontWeight: '700' },
  input: { color: theme.text, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: theme.border, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  inputHint: { color: theme.textDim, fontSize: 11, marginTop: -3, marginBottom: 10, marginLeft: 2 },
  primaryButton: { backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 13, alignItems: 'center', marginTop: 3 },
  primaryButtonText: { color: '#07150b', fontSize: 14, fontWeight: '800' },
  sectionLabel: { color: theme.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 11 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, marginBottom: 0 },
  searchButton: { backgroundColor: theme.accent, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  searchButtonText: { color: '#07150b', fontSize: 13, fontWeight: '800' },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  sectionHeading: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginLeft: 4, marginBottom: 8, marginTop: 4 },
  listCard: { borderRadius: 24, paddingHorizontal: 16, marginBottom: 18 },
  personRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  smallAction: { backgroundColor: theme.accentDeep, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8 },
  smallActionText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
  statusBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8 },
  statusText: { color: theme.textDim, fontSize: 12, fontWeight: '700' },
  secondaryAction: { color: '#E27878', fontSize: 12, fontWeight: '700' },
  chevron: { color: theme.textDim, fontSize: 24, marginLeft: 3 },
  emptyText: { color: theme.textDim, fontSize: 13, lineHeight: 19, paddingVertical: 18 },
  visibilityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  visibilityCopy: { flex: 1 },
  visibilitySwitchSlot: { width: 52, flexShrink: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  visibilityDetail: { color: theme.textDim, fontSize: 11, marginTop: 3 },
  selectionNote: { color: theme.textDim, fontSize: 10, lineHeight: 15, paddingVertical: 12 },
  message: { color: theme.accent, fontSize: 13, lineHeight: 19, textAlign: 'center', marginVertical: 8 },
  privacyNote: { color: theme.textDim, opacity: 0.75, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 9, paddingHorizontal: 18 },
  publishCard: { borderRadius: 24, padding: 18, marginBottom: 18 },
  publishButton: { backgroundColor: theme.accent, borderRadius: 15, alignItems: 'center', paddingVertical: 12, marginTop: 14 },
  publishButtonText: { color: '#07150b', fontSize: 13, fontWeight: '800' },
  publishedStatus: { color: theme.accent, fontSize: 10, lineHeight: 15, marginTop: 12 },
  disabledButton: { opacity: 0.45 },
});
