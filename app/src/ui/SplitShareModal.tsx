import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BackendError, SplitResponse, splitShares } from '../api/backend';
import { theme } from '../theme';
import Glass from './Glass';
import PopupContent from './PopupContent';
import PopupLayer from './PopupLayer';

const FALLBACK_SHARE_ORIGIN = 'https://algo-split.vercel.app';

type ShareAction = 'creating' | 'copying' | 'sharing' | 'revoking' | null;

export interface SplitShareModalProps {
  visible: boolean;
  split: SplitResponse | null;
  onDismiss: () => void;
  /** Lets the root navigator and deployments choose their public-link shape. */
  shareUrlForToken?: (token: string) => string;
}

interface CreatedShare {
  url: string;
  expiresAt: string;
  reviewExercises: string[];
}

function browserOrigin(): string | null {
  const location = (globalThis as { location?: { origin?: string } }).location;
  return location?.origin && location.origin !== 'null' ? location.origin : null;
}

/** Build the public web preview URL without ever putting split data in the URL. */
export function sharedSplitUrl(
  token: string,
  baseUrl: string =
    process.env.EXPO_PUBLIC_ALGOSPLIT_SHARE_BASE_URL ??
    browserOrigin() ??
    FALLBACK_SHARE_ORIGIN
): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  return `${normalizedBase}/share/${encodeURIComponent(token)}`;
}

async function copyText(text: string): Promise<void> {
  try {
    const copied = await Clipboard.setStringAsync(text);
    if (copied) return;
  } catch {
    // Web clipboard access can be unavailable on non-secure origins. Fall
    // through to browser-native and legacy user-gesture-safe alternatives.
  }

  const navigatorRef = (globalThis as {
    navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } };
  }).navigator;
  if (navigatorRef?.clipboard?.writeText) {
    try {
      await navigatorRef.clipboard.writeText(text);
      return;
    } catch {
      // Continue to the temporary-textarea fallback below.
    }
  }

  const documentRef = globalThis.document;
  if (!documentRef?.body) throw new Error('Clipboard is unavailable');
  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = documentRef.execCommand?.('copy') ?? false;
  documentRef.body.removeChild(textarea);
  if (!copied) throw new Error('Clipboard is unavailable');
}

export function splitShareErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BackendError) {
    if (error.status === 401) {
      return 'Your session expired. Sign in again, then retry.';
    }
    if (
      error.status === 409 &&
      error.message === 'Revoke an existing share link before creating another'
    ) {
      return 'You have reached the active-link limit. Revoke links from a split, then try again.';
    }
    if (
      error.status === 409 &&
      error.message === 'Update this split before sharing it'
    ) {
      return 'This older split needs to be updated and saved before it can be shared.';
    }
    if (error.status === 413) {
      return 'This split is too large to share as one link.';
    }
    if (error.status === 429) {
      return 'Too many share attempts. Wait a minute, then try again.';
    }
  }
  return fallback;
}

function expiryLabel(value: string): string {
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) return 'This link expires automatically.';
  return `Expires ${expiresAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export default function SplitShareModal({
  visible,
  split,
  onDismiss,
  shareUrlForToken = sharedSplitUrl,
}: SplitShareModalProps) {
  const [activeCount, setActiveCount] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusCheckedSplitId, setStatusCheckedSplitId] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<CreatedShare | null>(null);
  const [action, setAction] = useState<ShareAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const modalViewKey = visible && split ? split.id : null;
  const modalViewKeyRef = useRef<string | null>(modalViewKey);
  const operationGenerationRef = useRef(0);
  if (modalViewKeyRef.current !== modalViewKey) {
    modalViewKeyRef.current = modalViewKey;
    operationGenerationRef.current += 1;
  }

  const summary = useMemo(() => {
    const sessions = split?.sessions ?? [];
    return {
      cycleLength:
        split?.cycle_length ??
        Math.max(1, ...sessions.map((session) => session.day_number)),
      workoutDays: sessions.filter((session) => session.exercises.length > 0).length,
      exercises: sessions.reduce((total, session) => total + session.exercises.length, 0),
    };
  }, [split]);

  useEffect(() => {
    if (!visible || !split) {
      setCheckingStatus(false);
      setStatusCheckedSplitId(null);
      return;
    }
    let current = true;
    const generation = operationGenerationRef.current;
    const stillCurrent = () =>
      current && generation === operationGenerationRef.current;
    setCreatedShare(null);
    setActiveCount(0);
    setCheckingStatus(true);
    setStatusCheckedSplitId(null);
    setAction(null);
    setError(null);
    setNotice(null);
    setConfirmRevoke(false);
    splitShares
      .status(split.id)
      .then((response) => {
        if (stillCurrent()) setActiveCount(response.active_count);
      })
      .catch((cause: unknown) => {
        if (stillCurrent()) {
          setError(
            splitShareErrorMessage(
              cause,
              'Could not check existing links. You can still create a new one.'
            )
          );
        }
      })
      .finally(() => {
        if (stillCurrent()) {
          setStatusCheckedSplitId(split.id);
          setCheckingStatus(false);
        }
      });
    return () => {
      current = false;
    };
  }, [visible, split?.id]);

  if (!split) return null;

  const busy = action === 'creating' || action === 'revoking';
  const statusLookupPending = checkingStatus || statusCheckedSplitId !== split.id;
  const createDisabled = action !== null || statusLookupPending;

  const createLink = async () => {
    if (createDisabled) return;
    const generation = operationGenerationRef.current;
    const stillCurrent = () => generation === operationGenerationRef.current;
    setAction('creating');
    setError(null);
    setNotice(null);
    try {
      const response = await splitShares.create(split.id);
      if (!stillCurrent()) return;
      setCreatedShare({
        url: shareUrlForToken(response.token),
        expiresAt: response.expires_at,
        reviewExercises: [
          ...new Set(
            (response.review_exercises ?? []).map((name) => name.trim()).filter(Boolean)
          ),
        ],
      });
      setActiveCount(response.active_count);
      setNotice('Private link ready to share.');
    } catch (cause) {
      if (!stillCurrent()) return;
      setError(splitShareErrorMessage(cause, 'Could not create a share link. Try again.'));
    } finally {
      if (stillCurrent()) setAction(null);
    }
  };

  const copyLink = async () => {
    if (!createdShare || action) return;
    const generation = operationGenerationRef.current;
    const stillCurrent = () => generation === operationGenerationRef.current;
    setAction('copying');
    setError(null);
    setNotice(null);
    try {
      await copyText(createdShare.url);
      if (!stillCurrent()) return;
      setNotice('Link copied.');
    } catch {
      if (!stillCurrent()) return;
      setError('Could not copy the link on this device.');
    } finally {
      if (stillCurrent()) setAction(null);
    }
  };

  const shareLink = async () => {
    if (!createdShare || action) return;
    const generation = operationGenerationRef.current;
    const stillCurrent = () => generation === operationGenerationRef.current;
    setAction('sharing');
    setError(null);
    setNotice(null);
    const message = `${split.name} on AlgoSplit\nPreview the schedule and save your own copy.`;
    try {
      const navigatorRef = (globalThis as {
        navigator?: {
          share?: (data: { title: string; text: string; url: string }) => Promise<void>;
        };
      }).navigator;
      if (Platform.OS === 'web' && navigatorRef?.share) {
        await navigatorRef.share({
          title: `${split.name} on AlgoSplit`,
          text: 'Preview this workout split and save your own copy.',
          url: createdShare.url,
        });
      } else if (Platform.OS === 'web') {
        await copyText(createdShare.url);
        if (stillCurrent()) {
          setNotice('Sharing is not available here, so the link was copied.');
        }
      } else {
        await Share.share({
          title: `${split.name} on AlgoSplit`,
          // iOS has a dedicated URL field; Android shares URLs as message text.
          message: Platform.OS === 'ios' ? message : `${message}\n${createdShare.url}`,
          url: createdShare.url,
        });
      }
    } catch (cause) {
      const name =
        cause && typeof cause === 'object' && 'name' in cause
          ? String((cause as { name: unknown }).name)
          : '';
      if (stillCurrent() && name !== 'AbortError') {
        setError('Could not open sharing. Try copying the link.');
      }
    } finally {
      if (stillCurrent()) setAction(null);
    }
  };

  const revokeLinks = async () => {
    if (action) return;
    const generation = operationGenerationRef.current;
    const stillCurrent = () => generation === operationGenerationRef.current;
    setAction('revoking');
    setError(null);
    setNotice(null);
    try {
      const response = await splitShares.revokeAll(split.id);
      if (!stillCurrent()) return;
      setActiveCount(0);
      setCreatedShare(null);
      setConfirmRevoke(false);
      setNotice(
        response.revoked_count === 1
          ? 'The shared link was revoked.'
          : `${response.revoked_count} shared links were revoked.`
      );
    } catch (cause) {
      if (!stillCurrent()) return;
      setError(splitShareErrorMessage(cause, 'Could not revoke shared links. Try again.'));
    } finally {
      if (stillCurrent()) setAction(null);
    }
  };

  return (
    <PopupLayer
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel={`Share ${split.name}`}
      dismissDisabled={busy}
      maxWidth={460}
      cardRadius={26}
    >
      <Glass style={styles.card}>
        <PopupContent>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>SHARE SPLIT</Text>
              <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>
                {split.name}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close share split"
              hitSlop={10}
              disabled={busy}
              onPress={onDismiss}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, busy && styles.disabled]}>×</Text>
            </Pressable>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{summary.cycleLength}</Text>
              <Text style={styles.statLabel}>day cycle</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{summary.workoutDays}</Text>
              <Text style={styles.statLabel}>workout days</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{summary.exercises}</Text>
              <Text style={styles.statLabel}>exercises</Text>
            </View>
          </View>

          <Text style={styles.privacyCopy}>
            Friends can preview this schedule and save an independent copy. Your
            account details and workout history are never included.
          </Text>

          {statusLookupPending ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={theme.textDim} />
              <Text style={styles.statusText}>Checking shared links…</Text>
            </View>
          ) : activeCount > 0 ? (
            <View style={styles.statusRow}>
              <View style={styles.liveDot} />
              <Text style={styles.statusText}>
                {activeCount} active {activeCount === 1 ? 'link' : 'links'}
              </Text>
            </View>
          ) : null}

          {createdShare ? (
            <View style={styles.linkPanel}>
              <Text style={styles.linkLabel}>PRIVATE PREVIEW LINK</Text>
              <Text selectable style={styles.linkText} numberOfLines={1}>
                {createdShare.url}
              </Text>
              <Text style={styles.expiry}>{expiryLabel(createdShare.expiresAt)}</Text>
              {createdShare.reviewExercises.length > 0 ? (
                <View accessibilityLiveRegion="polite" style={styles.reviewWarning}>
                  <Text style={styles.reviewWarningTitle}>COPYING NEEDS A QUICK FIX</Text>
                  <Text style={styles.reviewWarningBody}>
                    Friends can preview this split, but they cannot copy these
                    account-specific exercises. Replace them with catalog exercises,
                    then create a new link.
                  </Text>
                  <View style={styles.reviewExerciseList}>
                    {createdShare.reviewExercises.map((name) => (
                      <Text key={name} style={styles.reviewExercise}>
                        • {name}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={styles.shareActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action === 'sharing' ? 'Sharing link' : 'Share link'}
                  accessibilityState={{
                    disabled: action !== null,
                    busy: action === 'sharing',
                  }}
                  disabled={action !== null}
                  onPress={shareLink}
                  style={styles.shareActionWrap}
                >
                  <Glass
                    style={styles.primaryButton}
                    tintColor="rgba(65,196,110,0.12)"
                    interactive={action === null}
                  >
                    {action === 'sharing' ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Share link</Text>
                    )}
                  </Glass>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action === 'copying' ? 'Copying link' : 'Copy link'}
                  accessibilityState={{ disabled: action !== null }}
                  disabled={action !== null}
                  onPress={copyLink}
                >
                  <Glass style={styles.copyButton} interactive>
                    <Text style={styles.copyButtonText}>
                      {action === 'copying' ? 'Copying…' : 'Copy'}
                    </Text>
                  </Glass>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                statusLookupPending
                  ? 'Checking existing share links'
                  : action === 'creating'
                    ? 'Creating share link'
                    : 'Create share link'
              }
              accessibilityState={{
                disabled: createDisabled,
                busy: statusLookupPending || action === 'creating',
              }}
              disabled={createDisabled}
              onPress={createLink}
            >
              <Glass
                style={styles.createButton}
                tintColor="rgba(65,196,110,0.12)"
                interactive={!createDisabled}
              >
                {action === 'creating' ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <Text style={styles.createButtonText}>
                    {activeCount > 0 ? 'Create another link' : 'Create share link'}
                  </Text>
                )}
              </Glass>
            </Pressable>
          )}

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {activeCount > 0 ? (
            confirmRevoke ? (
              <View style={styles.revokeConfirm}>
                <Text style={styles.revokeWarning}>
                  These links will stop opening, and unsaved previews can no
                  longer be copied. Existing saved copies are unaffected.
                </Text>
                <View style={styles.revokeActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={action !== null}
                    hitSlop={8}
                    onPress={() => setConfirmRevoke(false)}
                  >
                    <Text style={styles.cancelText}>Keep links</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action === 'revoking' ? 'Revoking links' : 'Confirm revoke links'}
                    disabled={action !== null}
                    hitSlop={8}
                    onPress={revokeLinks}
                  >
                    <Text style={[styles.revokeConfirmText, action !== null && styles.disabled]}>
                      {action === 'revoking' ? 'Revoking…' : 'Revoke'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={action !== null}
                hitSlop={8}
                onPress={() => setConfirmRevoke(true)}
                style={styles.revokeButton}
              >
                <Text style={[styles.revokeText, action !== null && styles.disabled]}>
                  Revoke all shared links
                </Text>
              </Pressable>
            )
          ) : null}
        </PopupContent>
      </Glass>
    </PopupLayer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.35,
    marginBottom: 7,
  },
  title: {
    color: theme.text,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -5,
    marginRight: -7,
  },
  closeText: {
    color: theme.textDim,
    fontSize: 29,
    lineHeight: 31,
    fontWeight: '300',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  privacyCopy: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },
  statusText: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.accent,
  },
  linkPanel: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(8,10,9,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.2)',
  },
  linkLabel: {
    color: theme.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  linkText: {
    color: theme.text,
    fontSize: 12,
    marginTop: 7,
  },
  expiry: {
    color: theme.textDim,
    fontSize: 10,
    marginTop: 5,
  },
  reviewWarning: {
    marginTop: 13,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(226,170,88,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,170,88,0.3)',
  },
  reviewWarningTitle: {
    color: '#DCAE6D',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  reviewWarningBody: {
    color: theme.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  reviewExerciseList: {
    gap: 3,
    marginTop: 8,
  },
  reviewExercise: {
    color: theme.text,
    fontSize: 11,
    lineHeight: 15,
  },
  shareActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 13,
  },
  shareActionWrap: {
    flex: 1,
  },
  primaryButton: {
    minHeight: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.28)',
  },
  primaryButtonText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  copyButton: {
    minHeight: 45,
    minWidth: 78,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  copyButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  createButton: {
    minHeight: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.28)',
  },
  createButtonText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  notice: {
    color: theme.accent,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
  error: {
    color: '#E27878',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
  revokeButton: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    marginTop: 5,
  },
  revokeText: {
    color: '#C97777',
    fontSize: 11,
    fontWeight: '700',
  },
  revokeConfirm: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.11)',
    paddingTop: 12,
  },
  revokeWarning: {
    color: theme.textDim,
    fontSize: 11,
    lineHeight: 16,
  },
  revokeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 24,
    marginTop: 9,
  },
  cancelText: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  revokeConfirmText: {
    color: '#E27878',
    fontSize: 12,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.4,
  },
});
