import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAccountState } from '../state/AccountState';
import { authErrorMessageForDisplay, type SocialProvider } from '../api/backend';
import {
  isSocialAuthCancellation,
  socialAuthErrorMessageForDisplay,
} from '../auth/socialAuth';
import { useAppState } from '../state/AppState';
import { theme } from '../theme';
import FadeIn from '../ui/FadeIn';
import Glass from '../ui/Glass';
import SocialProviderIcon from '../ui/SocialProviderIcon';

interface AccountScreenProps {
  onBack: () => void;
  onPrivacy: () => void;
}

export default function AccountScreen({ onBack, onPrivacy }: AccountScreenProps) {
  const account = useAccountState();
  const app = useAppState();
  const [busy, setBusy] = useState<'logout' | 'logoutAll' | 'delete' | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState<SocialProvider | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<SocialProvider | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    void account.refreshIdentities();
  }, [account.refreshIdentities]);

  const identitiesByProvider = new Map(
    account.identities.data.map((identity) => [identity.provider, identity])
  );
  const emailIdentity = identitiesByProvider.get('email');
  const socialProviders: SocialProvider[] = account.appleProviderEnabled
    ? Platform.OS === 'android'
      ? ['google']
      : ['google', 'apple']
    : ['google'];

  const connectIdentity = async (provider: SocialProvider) => {
    setIdentityBusy(provider);
    setIdentityError(null);
    try {
      await account.linkIdentity(provider);
    } catch (cause) {
      if (!isSocialAuthCancellation(cause)) {
        setIdentityError(
          authErrorMessageForDisplay(
            cause,
            socialAuthErrorMessageForDisplay(cause, 'Could not connect this account.')
          )
        );
      }
    } finally {
      setIdentityBusy(null);
    }
  };

  const disconnectIdentity = async (provider: SocialProvider) => {
    setIdentityBusy(provider);
    setIdentityError(null);
    try {
      await account.unlinkIdentity(provider);
      setConfirmDisconnect(null);
    } catch (cause) {
      setIdentityError(authErrorMessageForDisplay(cause, 'Could not disconnect this account.'));
    } finally {
      setIdentityBusy(null);
    }
  };

  const logout = async () => {
    setBusy('logout');
    setError(null);
    try {
      await account.logout();
    } catch (cause) {
      setError(authErrorMessageForDisplay(cause, 'Could not sign out.'));
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE') return;
    setBusy('delete');
    setError(null);
    try {
      await account.deleteAccount();
    } catch (cause) {
      setError(authErrorMessageForDisplay(cause, 'Could not delete the account.'));
      setBusy(null);
    }
  };

  const logoutAll = async () => {
    setBusy('logoutAll');
    setError(null);
    try {
      await account.logoutAll();
    } catch (cause) {
      setError(authErrorMessageForDisplay(cause, 'Could not sign out all devices.'));
      setBusy(null);
    }
  };

  const updateAnalysisDefaults = async (
    update: Parameters<typeof account.updateAnalysisPreferences>[0]
  ) => {
    setSettingsError(null);
    try {
      await account.updateAnalysisPreferences(update);
    } catch (cause) {
      setSettingsError(
        cause instanceof Error ? cause.message : 'Analysis defaults could not be saved.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.backChip} interactive>
          <Text style={styles.backText}>‹ Home</Text>
        </Glass>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FadeIn>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.title}>Your account</Text>
          <Text style={styles.email}>{account.user?.email}</Text>
        </FadeIn>

        {(app.pendingSyncCount > 0 || app.failedSyncCount > 0) && (
          <FadeIn delay={45}>
            <Glass style={styles.card}>
              <Text style={styles.cardTitle}>Workout sync</Text>
              <Text style={styles.body}>
                {app.failedSyncCount > 0
                  ? `${app.failedSyncCount} workout${app.failedSyncCount === 1 ? '' : 's'} could not be uploaded.`
                  : `${app.pendingSyncCount} workout${app.pendingSyncCount === 1 ? '' : 's'} waiting to upload.`}
              </Text>
              {app.failedSyncCount > 0 && (
                <Pressable onPress={app.retryFailedWorkouts}>
                  <Text style={styles.actionText}>Retry failed uploads</Text>
                </Pressable>
              )}
            </Glass>
          </FadeIn>
        )}

        <FadeIn delay={75}>
          <Glass style={styles.card}>
            <View style={styles.settingsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Connected accounts</Text>
                <Text style={styles.body}>
                  Add a sign-in method before removing another. Your training data stays in this account.
                </Text>
              </View>
              {account.identities.loading && <ActivityIndicator size="small" color={theme.accent} />}
            </View>

            <View style={styles.identityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlTitle}>Email &amp; password</Text>
                <Text style={styles.identityStatus}>
                  {emailIdentity
                    ? emailIdentity.email
                      ? `Connected as ${emailIdentity.email}`
                      : 'Connected'
                    : 'Not connected'}
                </Text>
              </View>
              <Text style={styles.identityFixed}>Managed from sign-in</Text>
            </View>

            {socialProviders.map((provider, index) => {
              const identity = identitiesByProvider.get(provider);
              const label = provider === 'google' ? 'Google' : 'Apple';
              const busyWithProvider = identityBusy === provider;
              const isLast = index === socialProviders.length - 1;
              return (
                <View key={provider} style={[styles.identityRow, isLast && styles.identityRowLast]}>
                  <View style={styles.identityProvider}>
                    <SocialProviderIcon provider={provider} size={26} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.controlTitle}>{label}</Text>
                      <Text style={styles.identityStatus}>
                        {identity
                          ? identity.email
                            ? `Connected as ${identity.email}`
                            : 'Connected'
                          : 'Not connected'}
                      </Text>
                      {identity && !identity.can_disconnect && (
                        <Text style={styles.identityHint}>Connect another method to remove this one.</Text>
                      )}
                    </View>
                  </View>
                  {!identity ? (
                    <Pressable
                      onPress={() => connectIdentity(provider)}
                      disabled={identityBusy !== null}
                      style={styles.identityAction}
                    >
                      {busyWithProvider ? (
                        <ActivityIndicator size="small" color={theme.accent} />
                      ) : (
                        <Text style={styles.identityActionText}>Connect</Text>
                      )}
                    </Pressable>
                  ) : confirmDisconnect === provider ? (
                    <View style={styles.disconnectConfirm}>
                      <Text style={styles.disconnectConfirmText}>Disconnect {label}?</Text>
                      <View style={styles.disconnectActions}>
                        <Pressable
                          onPress={() => setConfirmDisconnect(null)}
                          disabled={busyWithProvider}
                        >
                          <Text style={styles.cancelInline}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => disconnectIdentity(provider)}
                          disabled={busyWithProvider}
                        >
                          {busyWithProvider ? (
                            <ActivityIndicator size="small" color="#E27878" />
                          ) : (
                            <Text style={styles.disconnectAction}>Disconnect</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : identity.can_disconnect ? (
                    <Pressable
                      onPress={() => setConfirmDisconnect(provider)}
                      disabled={identityBusy !== null}
                      style={styles.identityAction}
                    >
                      <Text style={styles.disconnectAction}>Disconnect</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {(identityError || account.identities.error) && (
              <Text style={styles.error}>{identityError ?? account.identities.error}</Text>
            )}
          </Glass>
        </FadeIn>

        <FadeIn delay={110}>
          <Glass style={styles.card}>
            <View style={styles.settingsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Live stimulus defaults</Text>
                <Text style={styles.body}>These settings drive your Home stimulus body.</Text>
              </View>
              {account.recentStimulus.loading && (
                <ActivityIndicator size="small" color={theme.accent} />
              )}
            </View>

            <View style={styles.controlBlock}>
              <View style={styles.controlHeader}>
                <Text style={styles.controlTitle}>Hypertrophy window</Text>
                <Text style={styles.controlValue}>
                  {account.analysisPreferences.stimulusDuration}h
                </Text>
              </View>
              <View style={styles.stepperRow}>
                <Pressable
                  accessibilityLabel="Decrease hypertrophy window"
                  disabled={!account.analysisPreferencesReady}
                  onPress={() =>
                    updateAnalysisDefaults({
                      stimulusDuration: account.analysisPreferences.stimulusDuration - 12,
                    })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>−12</Text>
                </Pressable>
                <View style={styles.stepperTrack}>
                  <View
                    style={[
                      styles.stepperFill,
                      {
                        width: `${
                          ((account.analysisPreferences.stimulusDuration - 24) / 72) * 100
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Pressable
                  accessibilityLabel="Increase hypertrophy window"
                  disabled={!account.analysisPreferencesReady}
                  onPress={() =>
                    updateAnalysisDefaults({
                      stimulusDuration: account.analysisPreferences.stimulusDuration + 12,
                    })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>+12</Text>
                </Pressable>
              </View>
              <Text style={styles.controlHint}>
                How long post-training stimulus remains elevated, from 24–96 hours.
              </Text>
            </View>

            <View style={styles.controlBlock}>
              <View style={styles.controlHeader}>
                <Text style={styles.controlTitle}>Maintenance volume</Text>
                <Text style={styles.controlValue}>
                  {account.analysisPreferences.maintenanceVolume} sets
                </Text>
              </View>
              <View style={styles.stepperRow}>
                <Pressable
                  accessibilityLabel="Decrease maintenance volume"
                  disabled={!account.analysisPreferencesReady}
                  onPress={() =>
                    updateAnalysisDefaults({
                      maintenanceVolume: account.analysisPreferences.maintenanceVolume - 1,
                    })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <View style={styles.maintenanceTrack}>
                  {Array.from({ length: 9 }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.maintenanceBar,
                        index < account.analysisPreferences.maintenanceVolume &&
                          styles.maintenanceBarActive,
                      ]}
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityLabel="Increase maintenance volume"
                  disabled={!account.analysisPreferencesReady}
                  onPress={() =>
                    updateAnalysisDefaults({
                      maintenanceVolume: account.analysisPreferences.maintenanceVolume + 1,
                    })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.controlHint}>
                Weekly sets required before atrophy debt begins accumulating.
              </Text>
            </View>

            <View style={[styles.controlBlock, styles.controlBlockLast]}>
              <Text style={styles.controlTitle}>Data model</Text>
              <View style={styles.datasetRow}>
                {([
                  ['schoenfeld', 'Schoenfeld'],
                  ['pelland', 'Pelland'],
                  ['average', 'Average'],
                ] as const).map(([value, label]) => {
                  const active = account.analysisPreferences.dataset === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      disabled={!account.analysisPreferencesReady}
                      onPress={() => updateAnalysisDefaults({ dataset: value })}
                      style={[styles.datasetPill, active && styles.datasetPillActive]}
                    >
                      <Text style={[styles.datasetText, active && styles.datasetTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.controlHint}>
                Chooses the diminishing-returns dataset used by workout analysis.
              </Text>
            </View>
            {settingsError && <Text style={styles.error}>{settingsError}</Text>}
          </Glass>
        </FadeIn>

        <FadeIn delay={145}>
          <Glass style={styles.card}>
            <Pressable onPress={onPrivacy} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Privacy policy</Text>
                <Text style={styles.body}>Review how account and training data is handled.</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Glass>
        </FadeIn>

        <FadeIn delay={180}>
          <Glass style={styles.card}>
            <Text style={styles.cardTitle}>Active sessions</Text>
            <Text style={styles.body}>
              Signing out here leaves your other browsers and devices connected.
            </Text>
            <Pressable onPress={logout} disabled={busy !== null}>
              <Glass style={styles.button} interactive>
                {busy === 'logout' ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <Text style={styles.buttonText}>Sign out this device</Text>
                )}
              </Glass>
            </Pressable>
            {!confirmLogoutAll ? (
              <Pressable onPress={() => setConfirmLogoutAll(true)} disabled={busy !== null}>
                <Text style={styles.sessionDangerAction}>Sign out all devices</Text>
              </Pressable>
            ) : (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmLabel}>
                  This ends every browser and mobile session for your account.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setConfirmLogoutAll(false)}
                    disabled={busy !== null}
                  >
                    <Text style={styles.cancel}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={logoutAll} disabled={busy !== null}>
                    {busy === 'logoutAll' ? (
                      <ActivityIndicator color="#E27878" />
                    ) : (
                      <Text style={styles.dangerAction}>Confirm sign out all</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Glass>
        </FadeIn>

        <FadeIn delay={215}>
          <Glass style={[styles.card, styles.dangerCard]}>
            <Text style={styles.dangerTitle}>Delete account</Text>
            <Text style={styles.body}>
              Permanently deletes your account, saved splits, workouts, progress, and local account cache.
            </Text>
            {!confirmDelete ? (
              <Pressable onPress={() => setConfirmDelete(true)}>
                <Text style={styles.dangerAction}>Delete my account</Text>
              </Pressable>
            ) : (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmLabel}>Type DELETE to confirm</Text>
                <TextInput
                  accessibilityLabel="Type DELETE to confirm account deletion"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                />
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => {
                      setConfirmDelete(false);
                      setConfirmation('');
                    }}
                    disabled={busy !== null}
                  >
                    <Text style={styles.cancel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={deleteAccount}
                    disabled={confirmation !== 'DELETE' || busy !== null}
                  >
                    {busy === 'delete' ? (
                      <ActivityIndicator color="#E27878" />
                    ) : (
                      <Text
                        style={[
                          styles.dangerAction,
                          confirmation !== 'DELETE' && styles.disabled,
                        ]}
                      >
                        Permanently delete
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </Glass>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  backWrap: { position: 'absolute', top: 58, left: 20, zIndex: 4 },
  backChip: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16 },
  backText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 24, paddingTop: 124, paddingBottom: 56 },
  eyebrow: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  title: { color: theme.text, fontSize: 34, fontWeight: '700' },
  email: { color: theme.textDim, fontSize: 14, marginTop: 8, marginBottom: 26 },
  card: { borderRadius: 22, padding: 19, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  body: { color: theme.textDim, fontSize: 13, lineHeight: 19 },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  identityRowLast: { paddingBottom: 2 },
  identityProvider: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityStatus: { color: theme.textDim, fontSize: 11, lineHeight: 16, marginTop: 3 },
  identityHint: { color: theme.textDim, fontSize: 10, lineHeight: 14, marginTop: 5 },
  identityFixed: { color: theme.textDim, fontSize: 10, textAlign: 'right' },
  identityAction: { minWidth: 76, alignItems: 'flex-end', paddingVertical: 7 },
  identityActionText: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  disconnectConfirm: { minWidth: 126, alignItems: 'flex-end' },
  disconnectConfirmText: { color: theme.textDim, fontSize: 10, marginBottom: 6 },
  disconnectActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cancelInline: { color: theme.textDim, fontSize: 11, fontWeight: '600' },
  disconnectAction: { color: '#E27878', fontSize: 12, fontWeight: '700' },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  controlBlock: {
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  controlBlockLast: { paddingBottom: 2 },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  controlTitle: { color: theme.text, fontSize: 13, fontWeight: '700' },
  controlValue: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  controlHint: { color: theme.textDim, fontSize: 11, lineHeight: 16, marginTop: 9 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: {
    minWidth: 42,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  stepperText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  stepperTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stepperFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accent },
  maintenanceTrack: { flex: 1, flexDirection: 'row', gap: 3 },
  maintenanceBar: {
    flex: 1,
    height: 7,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  maintenanceBarActive: { backgroundColor: theme.accent },
  datasetRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  datasetPill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  datasetPillActive: { backgroundColor: 'rgba(65,196,110,0.18)' },
  datasetText: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  datasetTextActive: { color: theme.accent },
  chevron: { color: theme.textDim, fontSize: 28, marginLeft: 14 },
  actionText: { color: theme.accent, fontSize: 13, fontWeight: '700', marginTop: 14 },
  button: { borderRadius: 20, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  sessionDangerAction: { color: '#E27878', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  dangerCard: { borderColor: 'rgba(226,120,120,0.28)' },
  dangerTitle: { color: '#E27878', fontSize: 15, fontWeight: '700', marginBottom: 7 },
  dangerAction: { color: '#E27878', fontSize: 13, fontWeight: '700', marginTop: 15 },
  confirmArea: { marginTop: 15 },
  confirmLabel: { color: theme.textDim, fontSize: 12, marginBottom: 8 },
  input: { color: theme.text, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, paddingVertical: 12 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { color: theme.textDim, fontSize: 13, fontWeight: '600', marginTop: 15 },
  disabled: { opacity: 0.35 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginTop: 12 },
});
