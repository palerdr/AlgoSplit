import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BackendError,
  SplitCreate,
  SplitResponse,
  SharedSplitPreviewResponse,
  splitShares,
} from '../api/backend';
import { theme } from '../theme';
import Glass from '../ui/Glass';

export type SharedSplitAccountStatus =
  | 'unconfigured'
  | 'checking'
  | 'signedOut'
  | 'authenticated'
  | 'error';

export interface SharedSplitScreenProps {
  token: string;
  accountStatus: SharedSplitAccountStatus;
  /**
   * Used after a sign-in continuation: once the preview and account are both
   * ready, save without making the person tap the same intent twice.
   */
  autoSave?: boolean;
  onRequireSignIn: () => void;
  /** Clear any persisted sign-in continuation before the write begins. */
  onSaveStarted?: (token: string) => void | Promise<void>;
  /** Copy through the authenticated, atomic server endpoint. */
  onCopy: (token: string) => Promise<SplitResponse>;
  /** Called for a terminal missing, revoked, or expired capability. */
  onUnavailable?: (token: string) => void | Promise<void>;
  onSaved?: (savedSplit: SplitResponse) => void;
  onBack: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Build a strict create payload from the public response. Besides giving the
 * recipient an independent copy, this allowlist prevents an unexpected server
 * field from ever being echoed into an authenticated create request.
 */
export function copyableSharedSplit(split: SplitCreate): SplitCreate {
  return {
    name: split.name,
    ...(split.cycle_length !== undefined ? { cycle_length: split.cycle_length } : {}),
    ...(split.stimulus_duration !== undefined
      ? { stimulus_duration: split.stimulus_duration }
      : {}),
    ...(split.maintenance_volume !== undefined
      ? { maintenance_volume: split.maintenance_volume }
      : {}),
    ...(split.dataset !== undefined ? { dataset: split.dataset } : {}),
    sessions: split.sessions.map((session) => ({
      name: session.name,
      day_number: session.day_number,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        ...(exercise.unilateral !== undefined
          ? { unilateral: exercise.unilateral }
          : {}),
        ...(exercise.resistance_profile !== undefined
          ? { resistance_profile: exercise.resistance_profile }
          : {}),
      })),
    })),
  };
}

function expiryLabel(value: string): string | null {
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) return null;
  return expiresAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function loadErrorMessage(error: unknown): { title: string; body: string } {
  if (error instanceof BackendError && error.status === 404) {
    return {
      title: 'This link is no longer available',
      body: 'It may have expired or been revoked. Ask your friend to create a new share link.',
    };
  }
  return {
    title: 'Could not load this split',
    body: 'Check your connection and try opening the link again.',
  };
}

function unrecognizedExerciseMessage(error: unknown): string | null {
  if (!(error instanceof BackendError) || error.status !== 400) return null;
  const responseBody = error.detail;
  const detail =
    responseBody &&
    typeof responseBody === 'object' &&
    'detail' in responseBody
      ? (responseBody as { detail?: unknown }).detail
      : responseBody;
  if (!detail || typeof detail !== 'object') return null;
  const names = (detail as { unrecognized_exercises?: unknown })
    .unrecognized_exercises;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    !names.every((name) => typeof name === 'string')
  ) {
    return null;
  }
  return `Review these exercises before saving: ${names.join(', ')}. They may be custom to the person who shared this split.`;
}

export function reviewExercisesFromConflict(error: unknown): string[] | null {
  if (!(error instanceof BackendError) || error.status !== 409) return null;
  const responseBody = error.detail;
  const detail =
    responseBody &&
    typeof responseBody === 'object' &&
    'detail' in responseBody
      ? (responseBody as { detail?: unknown }).detail
      : responseBody;
  if (!detail || typeof detail !== 'object') return null;
  const names = (detail as { review_exercises?: unknown }).review_exercises;
  if (!Array.isArray(names)) return null;
  const normalized = names
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

function normalizedReviewExercises(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
}

export default function SharedSplitScreen({
  token,
  accountStatus,
  autoSave = false,
  onRequireSignIn,
  onSaveStarted,
  onCopy,
  onUnavailable,
  onSaved,
  onBack,
}: SharedSplitScreenProps) {
  const [preview, setPreview] = useState<SharedSplitPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyReviewExercises, setCopyReviewExercises] = useState<string[]>([]);
  const autoSaveTokenRef = useRef<string | null>(null);
  const reviewContinuationTokenRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const activeSaveTokenRef = useRef<string | null>(null);
  const viewGenerationRef = useRef(0);
  const renderedTokenRef = useRef(token);
  const onUnavailableRef = useRef(onUnavailable);
  renderedTokenRef.current = token;
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let current = true;
    const generation = ++viewGenerationRef.current;
    const stillCurrent = () =>
      current &&
      renderedTokenRef.current === token &&
      generation === viewGenerationRef.current;
    setPreview(null);
    setLoading(true);
    setLoadError(null);
    setSaveState(saveInFlightRef.current ? 'saving' : 'idle');
    setSaveError(null);
    setCopyReviewExercises([]);
    reviewContinuationTokenRef.current = null;
    if (retryKey === 0) autoSaveTokenRef.current = null;
    splitShares
      .getPublic(token)
      .then((response) => {
        if (stillCurrent()) {
          setPreview(response);
        }
      })
      .catch((error: unknown) => {
        if (stillCurrent()) {
          setLoadError(error);
          if (error instanceof BackendError && error.status === 404) {
            void Promise.resolve(onUnavailableRef.current?.(token)).catch(() => {});
          }
        }
      })
      .finally(() => {
        if (stillCurrent()) {
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [retryKey, token]);

  const senderReviewExercises = useMemo(
    () => normalizedReviewExercises(preview?.review_exercises),
    [preview]
  );
  const recipientReviewExercises = useMemo(
    () => normalizedReviewExercises(copyReviewExercises),
    [copyReviewExercises]
  );
  const reviewExercises = useMemo(
    () =>
      normalizedReviewExercises([
        ...senderReviewExercises,
        ...recipientReviewExercises,
      ]),
    [recipientReviewExercises, senderReviewExercises]
  );

  const saveCopy = useCallback(async () => {
    if (
      !preview ||
      saveInFlightRef.current ||
      saveState === 'saving' ||
      saveState === 'saved'
    ) {
      return;
    }
    if (accountStatus !== 'authenticated') {
      onRequireSignIn();
      return;
    }
    saveInFlightRef.current = true;
    activeSaveTokenRef.current = token;
    const generation = viewGenerationRef.current;
    const stillCurrent = () =>
      renderedTokenRef.current === token &&
      generation === viewGenerationRef.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      // Re-resolve immediately before saving so an owner revocation also
      // disables copies from previews that were already open.
      const currentPreview = await splitShares.getPublic(token);
      if (!stillCurrent()) return;
      await onSaveStarted?.(token);
      if (!stillCurrent()) return;

      const revalidatedReviewExercises = normalizedReviewExercises(
        currentPreview.review_exercises
      );
      if (revalidatedReviewExercises.length > 0) {
        // Public review metadata is sender-side: keep its provenance so the UI
        // does not suggest a recipient account change can make it portable.
        setPreview(currentPreview);
        setSaveState('idle');
        return;
      }

      const saved = await onCopy(token);
      if (!stillCurrent()) return;
      setSaveState('saved');
      onSaved?.(saved);
    } catch (error) {
      if (!stillCurrent()) return;
      setSaveState('idle');
      const conflictExercises = reviewExercisesFromConflict(error);
      if (conflictExercises) {
        setCopyReviewExercises(conflictExercises);
        setSaveError(
          'These exercise names need review before this split can be copied.'
        );
        return;
      }
      if (error instanceof BackendError && error.status === 404) {
        // A capability 404 is terminal by design. Leave the preview state so
        // it cannot offer another copy attempt against a revoked/expired link.
        setPreview(null);
        setLoadError(error);
        setSaveError(null);
        void Promise.resolve(onUnavailableRef.current?.(token)).catch(() => {});
        return;
      }
      setSaveError(
        unrecognizedExerciseMessage(error) ??
          (error instanceof BackendError && error.status === 401
            ? 'Your session expired. Sign in again, then save this split.'
            : 'Could not save this split. Your copy was not created.')
      );
    } finally {
      // Keep copies serialized across token changes. A stale completion may
      // release the lock, but its token/generation guards cannot mutate the
      // newly-rendered preview or navigate away from it.
      saveInFlightRef.current = false;
      activeSaveTokenRef.current = null;
      if (!stillCurrent()) setSaveState('idle');
    }
  }, [
    accountStatus,
    onCopy,
    onRequireSignIn,
    onSaveStarted,
    onSaved,
    preview,
    saveState,
    token,
  ]);

  useEffect(() => {
    if (
      !autoSave ||
      !preview ||
      reviewExercises.length > 0 ||
      saveInFlightRef.current ||
      accountStatus !== 'authenticated' ||
      autoSaveTokenRef.current === token
    ) {
      return;
    }
    autoSaveTokenRef.current = token;
    void saveCopy();
  }, [
    accountStatus,
    autoSave,
    preview,
    reviewExercises,
    saveCopy,
    saveState,
    token,
  ]);

  useEffect(() => {
    if (
      !autoSave ||
      !preview ||
      reviewExercises.length === 0 ||
      accountStatus !== 'authenticated' ||
      reviewContinuationTokenRef.current === token
    ) {
      return;
    }
    reviewContinuationTokenRef.current = token;
    const generation = viewGenerationRef.current;
    void Promise.resolve(onSaveStarted?.(token)).catch(() => {
      if (generation === viewGenerationRef.current) {
        setSaveError(
          'Could not safely finish the sign-in continuation. Close this preview and try again.'
        );
      }
    });
  }, [
    accountStatus,
    autoSave,
    onSaveStarted,
    preview,
    reviewExercises,
    token,
  ]);

  const summary = useMemo(() => {
    const sessions = preview?.split.sessions ?? [];
    return {
      cycleLength:
        preview?.split.cycle_length ??
        Math.max(1, ...sessions.map((session) => session.day_number)),
      workoutDays: sessions.filter((session) => session.exercises.length > 0).length,
      exerciseCount: sessions.reduce(
        (total, session) => total + session.exercises.length,
        0
      ),
      sessions: [...sessions].sort((a, b) => a.day_number - b.day_number),
    };
  }, [preview]);

  const saveButtonLabel =
    saveState === 'saving'
      ? activeSaveTokenRef.current !== token
        ? 'Finishing previous copy…'
        : 'Saving your copy…'
      : saveState === 'saved'
        ? 'Saved to your splits'
        : reviewExercises.length > 0
          ? 'Review required'
        : accountStatus === 'checking'
          ? 'Checking your account…'
          : accountStatus === 'authenticated'
            ? 'Save a copy'
            : 'Sign in to save';

  const saveDisabled =
    saveState !== 'idle' ||
    accountStatus === 'checking' ||
    reviewExercises.length > 0;
  const senderReviewRequired = senderReviewExercises.length > 0;
  const recipientReviewRequired = recipientReviewExercises.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={onBack}
        >
          <Glass style={styles.backChip} interactive>
            <Text style={styles.backText}>‹ Back</Text>
          </Glass>
        </Pressable>
        <Text style={styles.brand}>ALGOSPLIT</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View
            accessible
            accessibilityLabel="Loading shared split"
            style={styles.centerState}
          >
            <Glass style={styles.stateCard}>
              <ActivityIndicator color={theme.accent} />
              <Text style={styles.stateTitle}>Opening shared split…</Text>
              <Text style={styles.stateBody}>Loading the read-only schedule.</Text>
            </Glass>
          </View>
        ) : loadError || !preview ? (
          <View style={styles.centerState}>
            <Glass style={styles.stateCard}>
              <Text accessibilityRole="header" style={styles.stateTitle}>
                {loadErrorMessage(loadError).title}
              </Text>
              <Text style={styles.stateBody}>{loadErrorMessage(loadError).body}</Text>
              {!(loadError instanceof BackendError && loadError.status === 404) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetryKey((value) => value + 1)}
                >
                  <Glass style={styles.retryButton} interactive>
                    <Text style={styles.retryText}>Try again</Text>
                  </Glass>
                </Pressable>
              ) : null}
            </Glass>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>SHARED WITH YOU</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {preview.split.name}
              </Text>
              <Text style={styles.heroBody}>
                A read-only workout schedule from a friend. Save it to make an
                independent copy you can edit.
              </Text>
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
                  <Text style={styles.statValue}>{summary.exerciseCount}</Text>
                  <Text style={styles.statLabel}>exercises</Text>
                </View>
              </View>
              {expiryLabel(preview.expires_at) ? (
                <Text style={styles.expires}>
                  Preview available until {expiryLabel(preview.expires_at)}
                </Text>
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SCHEDULE</Text>
              <Text style={styles.readOnlyLabel}>READ ONLY</Text>
            </View>

            {summary.sessions.map((session, sessionIndex) => (
              <Glass
                key={`${session.day_number}-${sessionIndex}-${session.name}`}
                style={styles.sessionCard}
              >
                <View style={styles.sessionHeader}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>DAY {session.day_number}</Text>
                  </View>
                  <Text style={styles.sessionName} numberOfLines={2}>
                    {session.name}
                  </Text>
                  <Text style={styles.exerciseCount}>
                    {session.exercises.length === 0
                      ? 'Rest'
                      : `${session.exercises.length} ${
                          session.exercises.length === 1 ? 'exercise' : 'exercises'
                        }`}
                  </Text>
                </View>

                {session.exercises.length === 0 ? (
                  <Text style={styles.restDay}>Recovery day</Text>
                ) : (
                  <View style={styles.exerciseList}>
                    {session.exercises.map((exercise, exerciseIndex) => (
                      <View
                        key={`${session.day_number}-${exerciseIndex}-${exercise.name}`}
                        style={[
                          styles.exerciseRow,
                          exerciseIndex > 0 && styles.exerciseRowBorder,
                        ]}
                      >
                        <View style={styles.exerciseCopy}>
                          <Text style={styles.exerciseName} numberOfLines={2}>
                            {exercise.name}
                          </Text>
                          {exercise.unilateral || exercise.resistance_profile ? (
                            <Text style={styles.exerciseMeta}>
                              {[
                                exercise.unilateral ? 'Unilateral' : null,
                                exercise.resistance_profile
                                  ? `${exercise.resistance_profile} profile`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.setBadge}>
                          <Text style={styles.setValue}>{exercise.sets}</Text>
                          <Text style={styles.setLabel}>
                            {exercise.sets === 1 ? 'set' : 'sets'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Glass>
            ))}

            <Glass style={styles.saveCard}>
              <Text style={styles.saveTitle}>
                {saveState === 'saved'
                  ? 'Your copy is ready'
                  : senderReviewRequired
                    ? 'The sender needs to update this split'
                    : recipientReviewRequired
                      ? 'Resolve an account conflict'
                    : 'Make it yours'}
              </Text>
              <Text style={styles.saveBody}>
                {senderReviewRequired
                  ? 'This snapshot includes account-specific exercise setup that cannot be transferred safely.'
                  : recipientReviewRequired
                    ? 'Some exercise names in this split conflict with custom exercises already in your account.'
                  : 'Saving creates an independent copy of this schedule that you can edit without changing your friend’s split.'}
              </Text>
              {senderReviewRequired ? (
                <View
                  style={styles.reviewPanel}
                >
                  <Text style={styles.reviewLabel}>UPDATE NEEDED FROM SENDER</Text>
                  {senderReviewExercises.map((exercise) => (
                    <Text key={exercise} style={styles.reviewExercise}>
                      • {exercise}
                    </Text>
                  ))}
                  <Text style={styles.reviewHelp}>
                    Ask the sender to replace these with catalog exercises and
                    create a new share link.
                  </Text>
                </View>
              ) : null}
              {recipientReviewRequired ? (
                <View accessibilityLiveRegion="polite" style={styles.reviewPanel}>
                  <Text style={styles.reviewLabel}>CONFLICTS IN YOUR ACCOUNT</Text>
                  {recipientReviewExercises.map((exercise) => (
                    <Text key={exercise} style={styles.reviewExercise}>
                      • {exercise}
                    </Text>
                  ))}
                  <Text style={styles.reviewHelp}>
                    Rename or remove the matching custom exercises in your
                    account, then reopen this same link.
                  </Text>
                </View>
              ) : null}
              {saveError ? (
                <Text accessibilityLiveRegion="polite" style={styles.saveError}>
                  {saveError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saveButtonLabel}
                accessibilityState={{ disabled: saveDisabled, busy: saveState === 'saving' }}
                disabled={saveDisabled}
                onPress={saveCopy}
              >
                <Glass
                  style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
                  tintColor="rgba(65,196,110,0.14)"
                  interactive={!saveDisabled}
                >
                  {saveState === 'saving' ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <Text
                      style={[
                        styles.saveButtonText,
                        saveState === 'saved' && styles.savedButtonText,
                      ]}
                    >
                      {saveButtonLabel}
                    </Text>
                  )}
                </Glass>
              </Pressable>
              <Text style={styles.privacyNote}>
                No workout history or account information is attached to this split.
              </Text>
            </Glass>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backChip: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  backText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  brand: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 124,
    paddingBottom: 56,
  },
  centerState: {
    minHeight: 420,
    justifyContent: 'center',
  },
  stateCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  stateTitle: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
  },
  stateBody: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
  },
  retryButton: {
    borderRadius: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 22,
    marginTop: 18,
  },
  retryText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  hero: {
    paddingHorizontal: 2,
  },
  eyebrow: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    color: theme.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  heroBody: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
    maxWidth: 520,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: theme.text,
    fontSize: 21,
    fontWeight: '700',
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  expires: {
    color: theme.textDim,
    fontSize: 10,
    marginTop: 10,
    textAlign: 'right',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  readOnlyLabel: {
    color: theme.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sessionCard: {
    borderRadius: 21,
    padding: 17,
    marginBottom: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayBadge: {
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(65,196,110,0.12)',
  },
  dayBadgeText: {
    color: theme.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sessionName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  exerciseCount: {
    color: theme.textDim,
    fontSize: 10,
  },
  restDay: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: 14,
  },
  exerciseList: {
    marginTop: 10,
  },
  exerciseRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  exerciseRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.09)',
  },
  exerciseCopy: {
    flex: 1,
    paddingRight: 12,
  },
  exerciseName: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  exerciseMeta: {
    color: theme.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  setBadge: {
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 4,
  },
  setValue: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  setLabel: {
    color: theme.textDim,
    fontSize: 9,
    fontWeight: '600',
  },
  saveCard: {
    borderRadius: 24,
    padding: 20,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.2)',
  },
  saveTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  saveBody: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  reviewPanel: {
    borderRadius: 15,
    marginTop: 14,
    padding: 14,
    backgroundColor: 'rgba(226,120,120,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,120,120,0.24)',
  },
  reviewLabel: {
    color: '#E9A2A2',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 7,
  },
  reviewExercise: {
    color: theme.text,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
  },
  reviewHelp: {
    color: theme.textDim,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 8,
  },
  saveError: {
    color: '#E27878',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(65,196,110,0.3)',
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  savedButtonText: {
    color: theme.text,
  },
  privacyNote: {
    color: theme.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 10,
  },
});
