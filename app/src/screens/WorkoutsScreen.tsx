import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SessionTemplateResponse } from '../api/backend';
import { useAccountState } from '../state/AccountState';
import {
  AccountWorkoutEditorEntry,
  accountWorkoutEditorGroups,
} from '../workout/splitSessions';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';
import DeleteConfirmationModal from '../ui/DeleteConfirmationModal';
import SplitWizard from '../components/workouts/SplitWizard';
import WorkoutEditor from '../components/workouts/WorkoutEditor';

interface WorkoutsScreenProps {
  onBack: () => void;
  startInSplitCreation?: boolean;
  onActiveSplitSet?: (splitId: string) => void;
}

type DeleteTarget = { splitId: string; name: string };
type Mode = 'browse' | 'newSplit' | 'sessionEditor' | 'templateEditor';

const tick = () => Haptics.selectionAsync().catch(() => {});

const ACTIVE_TRACK_HEIGHT = 68;
const ACTIVE_TRACK_PADDING = 6;
const ACTIVE_THUMB_SIZE = ACTIVE_TRACK_HEIGHT - ACTIVE_TRACK_PADDING * 2;
const ACTIVE_SLIDE_THRESHOLD = 0.88;

function useReduceMotionEnabled(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (live) setReduceMotionEnabled(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}

/**
 * A deliberate slide gesture keeps active-split changes from being accidental.
 * The two Glass views are siblings: only their inner color/text layers animate,
 * while the thumb's glass moves without ever receiving animated opacity.
 */
function SlideToSetActive({
  splitId,
  splitName,
  onComplete,
}: {
  splitId: string;
  splitName: string;
  onComplete: () => void;
}) {
  const reduceMotionEnabled = useReduceMotionEnabled();
  const reduceMotionRef = useRef(reduceMotionEnabled);
  const onCompleteRef = useRef(onComplete);
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const maxX = Math.max(
    0,
    trackWidth - ACTIVE_THUMB_SIZE - ACTIVE_TRACK_PADDING * 2
  );
  const maxXRef = useRef(maxX);
  const dragStartXRef = useRef(0);
  const completingRef = useRef(false);
  const armedRef = useRef(false);
  const completeSlideRef = useRef<() => void>(() => {});

  reduceMotionRef.current = reduceMotionEnabled;
  onCompleteRef.current = onComplete;
  maxXRef.current = maxX;

  useEffect(() => {
    completingRef.current = false;
    armedRef.current = false;
    progress.setValue(0);
  }, [progress, splitId]);

  useEffect(() => {
    pulse.stopAnimation();
    if (reduceMotionEnabled) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotionEnabled]);

  const resetSlide = () => {
    armedRef.current = false;
    if (reduceMotionRef.current) {
      progress.setValue(0);
      return;
    }
    Animated.spring(progress, {
      toValue: 0,
      stiffness: 320,
      damping: 24,
      mass: 0.75,
      useNativeDriver: false,
    }).start();
  };

  completeSlideRef.current = () => {
    if (completingRef.current) return;
    completingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    const commit = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(
        `${splitName} is now your active split`
      );
      onCompleteRef.current();
    };

    if (reduceMotionRef.current) {
      progress.setValue(1);
      commit();
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) commit();
      else completingRef.current = false;
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !completingRef.current && maxXRef.current > 0,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !completingRef.current &&
        maxXRef.current > 0 &&
        Math.abs(gesture.dx) > 3,
      onPanResponderGrant: () => {
        progress.stopAnimation((value) => {
          dragStartXRef.current = value * maxXRef.current;
        });
      },
      onPanResponderMove: (_, gesture) => {
        if (completingRef.current || maxXRef.current <= 0) return;
        const x = Math.min(
          Math.max(dragStartXRef.current + gesture.dx, 0),
          maxXRef.current
        );
        progress.setValue(x / maxXRef.current);
        const armed = x >= maxXRef.current * ACTIVE_SLIDE_THRESHOLD;
        if (armed !== armedRef.current) {
          armedRef.current = armed;
          tick();
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (completingRef.current || maxXRef.current <= 0) return;
        const x = Math.min(
          Math.max(dragStartXRef.current + gesture.dx, 0),
          maxXRef.current
        );
        if (x >= maxXRef.current * ACTIVE_SLIDE_THRESHOLD) {
          completeSlideRef.current();
        } else {
          resetSlide();
        }
      },
      onPanResponderTerminate: resetSlide,
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxX],
  });
  const webActivationProps =
    Platform.OS === 'web'
      ? {
          tabIndex: 0 as const,
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            const isSpace = event.key === ' ' || event.key === 'Spacebar';
            if (isSpace) event.preventDefault();
            if ((event.key === 'Enter' || isSpace) && !event.repeat) {
              completeSlideRef.current();
            }
          },
          // Screen readers commonly invoke a semantic button with a synthetic
          // zero-detail click. Accept that AT path while ignoring real pointer
          // clicks, which must still use the deliberate drag gesture.
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            if (event.detail === 0) completeSlideRef.current();
          },
        }
      : {};

  return (
    <View
      {...webActivationProps}
      style={styles.activeSlider}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Set ${splitName} as active split`}
      accessibilityHint="Slide the round control to the right. Screen reader users can activate this button."
      accessibilityActions={[{ name: 'activate', label: 'Set active split' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') completeSlideRef.current();
      }}
    >
      <Glass style={styles.activeSliderTrack}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeSliderFill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [ACTIVE_TRACK_HEIGHT, Math.max(ACTIVE_TRACK_HEIGHT, trackWidth)],
              }),
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.28],
              }),
            },
          ]}
        />
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.activeSliderLabel,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.7],
                outputRange: [0.82, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          slide to set active
        </Animated.Text>
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.activeSliderReadyLabel,
            {
              opacity: progress.interpolate({
                inputRange: [0.55, 0.9],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          release to activate
        </Animated.Text>
      </Glass>
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.activeSliderThumbWrap, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <Glass style={styles.activeSliderThumb} interactive>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeSliderThumbGlow,
              {
                opacity: progress.interpolate({
                  inputRange: [0.65, 1],
                  outputRange: [0, 0.48],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.activeSliderChevron,
              {
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.52, 1],
                }),
              },
            ]}
          >
            ›
          </Animated.Text>
        </Glass>
      </Animated.View>
    </View>
  );
}

export default function WorkoutsScreen({
  onBack,
  startInSplitCreation = false,
  onActiveSplitSet,
}: WorkoutsScreenProps) {
  const account = useAccountState();
  const groups = useMemo(
    () => accountWorkoutEditorGroups(account.splits.data),
    [account.splits.data]
  );
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(startInSplitCreation ? 'newSplit' : 'browse');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingRestDay, setEditingRestDay] = useState<number | undefined>(undefined);
  // Snapshot rather than a live cache lookup: a background refresh must not
  // flip an in-progress edit between create and update mid-flight.
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplateResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedSplitId) ?? null;
  const editingSplit = account.splits.data.find((split) => split.id === selectedSplitId) ?? null;
  const editingSession =
    editingSplit?.sessions.find((session) => session.id === editingSessionId) ?? undefined;

  useEffect(() => {
    if (account.status === 'authenticated') {
      account.ensureWorkoutTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  // If a background refresh drops the split being edited (deleted elsewhere),
  // leave the editor cleanly instead of stranding the mode machine.
  useEffect(() => {
    if (mode === 'sessionEditor' && !editingSplit) {
      setMode('browse');
      setEditingSessionId(null);
      setEditingRestDay(undefined);
    }
  }, [mode, editingSplit]);

  const openSessionEditor = (
    splitId: string,
    sessionId: string | null,
    restDay?: number
  ) => {
    tick();
    setSelectedSplitId(splitId);
    setEditingSessionId(sessionId);
    setEditingRestDay(restDay);
    setMode('sessionEditor');
  };

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([account.refreshSplits(), account.refreshWorkoutTemplates()]);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await account.deleteSplit(deleteTarget.splitId);
      setSelectedSplitId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDeleteTarget(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not delete this item.');
    } finally {
      setDeleting(false);
    }
  };

  if (mode === 'newSplit') {
    return (
      <SplitWizard
        onCancel={() => setMode('browse')}
        onSaved={(saved, setAsActive) => {
          if (setAsActive && onActiveSplitSet) {
            onActiveSplitSet(saved.id);
            return;
          }
          setSelectedSplitId(saved.id);
          setMode('browse');
        }}
      />
    );
  }

  if (mode === 'templateEditor') {
    return (
      <WorkoutEditor
        key={`template:${editingTemplate?.id ?? 'new'}`}
        mode="template"
        template={editingTemplate}
        onCancel={() => {
          setEditingTemplate(null);
          setMode('browse');
        }}
        onSaved={() => {
          setEditingTemplate(null);
          setMode('browse');
        }}
        onDelete={
          editingTemplate
            ? async () => {
                await account.deleteWorkoutTemplate(editingTemplate.id);
                setEditingTemplate(null);
                setMode('browse');
              }
            : undefined
        }
      />
    );
  }

  if (mode === 'sessionEditor' && editingSplit) {
    return (
      <WorkoutEditor
        key={`${editingSplit.id}:${editingSessionId ?? `new:${editingRestDay ?? 'open'}`}`}
        mode="session"
        split={editingSplit}
        session={editingSession}
        initialDay={editingRestDay}
        onCancel={() => {
          setEditingSessionId(null);
          setEditingRestDay(undefined);
          setMode('browse');
        }}
        onSaved={(saved) => {
          setSelectedSplitId(saved.id);
          setEditingSessionId(null);
          setEditingRestDay(undefined);
          setMode('browse');
        }}
        onDelete={
          editingSession
            ? async () => {
                await account.deleteSplitSession(editingSplit.id, editingSession.id);
                setEditingSessionId(null);
                setEditingRestDay(undefined);
                setMode('browse');
              }
            : undefined
        }
      />
    );
  }

  if (selectedGroup) {
    const selectedIsActive = selectedGroup.id === account.activeSplitId;
    return (
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Workouts and Splits"
            onPress={() => {
              tick();
              setDeleteTarget(null);
              setActionError(null);
              setSelectedSplitId(null);
            }}
            hitSlop={8}
            style={styles.backWrap}
          >
            <Glass style={styles.backChip} interactive>
              <View style={styles.detailBackContent}>
                <Text style={styles.detailBackChevron}>‹</Text>
                <Text style={styles.backText}>Workouts and Splits</Text>
              </View>
            </Glass>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedGroup.name} split`}
            onPress={() => {
              tick();
              setActionError(null);
              setDeleteTarget({ splitId: selectedGroup.id, name: selectedGroup.name });
            }}
            disabled={deleting}
          >
            <Glass style={styles.headerDeleteButton} interactive>
              <Text style={styles.headerDeleteText}>Delete</Text>
            </Glass>
          </Pressable>
        </View>
        <Text style={styles.title}>{selectedGroup.name}</Text>

        <FlatList
          style={styles.detailDayList}
          data={selectedGroup.sessions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshAll}
              tintColor={theme.textDim}
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn delay={(index + 1) * 45}>
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.kind === 'rest' && item.synthetic
                      ? `Add a workout to Day ${item.dayNumber}, currently rest`
                      : `Edit Day ${item.dayNumber}, ${item.name}`
                  }
                  accessibilityHint="Opens this day in the workout editor"
                  onPress={() =>
                    openSessionEditor(
                      item.splitId,
                      item.sessionId,
                      item.kind === 'rest' && item.synthetic ? item.dayNumber : undefined
                    )
                  }
                  style={styles.openRow}
                >
                  <View style={styles.rowCopy}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.dayLabel}>Day {item.dayNumber}</Text>
                      <Text style={styles.nameRowText}>{item.name}</Text>
                    </View>
                    {item.kind === 'workout' ? (
                      <Text style={styles.rowMeta}>
                        {item.exercises.length}{' '}
                        {item.exercises.length === 1 ? 'exercise' : 'exercises'}
                      </Text>
                    ) : (
                      <Text style={styles.rowMeta}>
                        {item.synthetic
                          ? 'Rest day · Tap to add a workout'
                          : 'Rest day · Tap to edit'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Glass>
            </FadeIn>
          )}
          contentContainerStyle={styles.detailDayListContent}
        />
        <View style={styles.activeControlSection}>
          <Text style={styles.activeControlEyebrow}>ACTIVE SPLIT</Text>
          {selectedIsActive ? (
            <Glass style={styles.activeStatus}>
              <Text style={styles.activeStatusCheck}>✓</Text>
              <View style={styles.activeStatusCopy}>
                <Text style={styles.activeStatusTitle}>Currently active</Text>
                <Text style={styles.activeStatusHint}>
                  This split is ready for one-tap starts from Home.
                </Text>
              </View>
            </Glass>
          ) : (
            <SlideToSetActive
              splitId={selectedGroup.id}
              splitName={selectedGroup.name}
              onComplete={() => {
                account.setActiveSplit(selectedGroup.id);
                if (onActiveSplitSet) onActiveSplitSet(selectedGroup.id);
                else onBack();
              }}
            />
          )}
        </View>
        <DeleteConfirmationModal
          visible={deleteTarget !== null}
          title="Delete split?"
          message={
            deleteTarget
              ? `“${deleteTarget.name}” and all of its workout days will be permanently deleted.`
              : ''
          }
          busy={deleting}
          error={actionError}
          onCancel={() => {
            setDeleteTarget(null);
            setActionError(null);
          }}
          onConfirm={confirmDelete}
        />
      </View>
    );
  }

  const templates = account.workoutTemplates;
  const splits = account.splits;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
          <Glass style={styles.backChip} interactive>
            <Text style={styles.backText}>‹ Home</Text>
          </Glass>
        </Pressable>
      </View>
      <Text style={styles.title}>Workouts and Splits</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={theme.textDim}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <FadeIn>
          <Text style={styles.sectionLabel}>
            Splits{' '}
            <Text style={styles.sectionHint}>
              (a combination of workouts in a repeating schedule)
            </Text>
          </Text>
        </FadeIn>
        <FadeIn delay={30}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new split"
            onPress={() => {
              tick();
              setMode('newSplit');
            }}
          >
            <Glass style={styles.newBtn} interactive>
              <Text style={styles.newBtnText}>+ New split</Text>
            </Glass>
          </Pressable>
        </FadeIn>
        {splits.loading && !splits.loaded && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>Loading your saved splits…</Text>
          </Glass>
        )}
        {splits.error && (
          <Pressable onPress={account.refreshSplits}>
            <Glass style={styles.notice} interactive>
              <Text style={styles.errorText}>Saved splits could not load.</Text>
              <Text style={styles.noticeText}>Tap to retry. Demo plans were not substituted.</Text>
            </Glass>
          </Pressable>
        )}
        {splits.loaded && !splits.error && groups.length === 0 && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>
              No saved splits yet. Create a split and it will appear here.
            </Text>
          </Glass>
        )}
        {groups.map((group, index) => {
          const workoutDays = group.sessions.filter(
            (session: AccountWorkoutEditorEntry) => session.kind === 'workout'
          );
          const isActive = group.id === account.activeSplitId;
          return (
            <FadeIn key={group.id} delay={(index + 2) * 30}>
              <Glass style={styles.nameRow} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${group.name} split`}
                  onPress={() => {
                    tick();
                    setDeleteTarget(null);
                    setActionError(null);
                    setSelectedSplitId(group.id);
                  }}
                  style={styles.openRow}
                >
                  <View style={styles.rowCopy}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.nameRowText}>{group.name}</Text>
                      {isActive && <Text style={styles.activeBadge}>ACTIVE</Text>}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {workoutDays.length} workout{' '}
                      {workoutDays.length === 1 ? 'day' : 'days'}
                      {group.cycleLength ? ` · ${group.cycleLength}-day cycle` : ''}
                      {workoutDays.length > 0
                        ? ` · ${workoutDays.map((session) => session.name).join(' · ')}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Glass>
            </FadeIn>
          );
        })}

        <FadeIn delay={60}>
          <Text style={[styles.sectionLabel, styles.splitsLabel]}>Workouts</Text>
        </FadeIn>
        <FadeIn delay={90}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new workout"
            onPress={() => {
              tick();
              setEditingTemplate(null);
              setMode('templateEditor');
            }}
          >
            <Glass style={styles.newBtn} interactive>
              <Text style={styles.newBtnText}>+ New workout</Text>
            </Glass>
          </Pressable>
        </FadeIn>
        {templates.loading && !templates.loaded && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>Loading your saved workouts…</Text>
          </Glass>
        )}
        {templates.error && (
          <Pressable onPress={account.refreshWorkoutTemplates}>
            <Glass style={styles.notice} interactive>
              <Text style={styles.errorText}>Saved workouts could not load.</Text>
              <Text style={styles.noticeText}>Tap to retry.</Text>
            </Glass>
          </Pressable>
        )}
        {templates.loaded && !templates.error && templates.data.length === 0 && (
          <Glass style={styles.notice}>
            <Text style={styles.noticeText}>
              No saved workouts yet. Create one and it will appear here.
            </Text>
          </Glass>
        )}
        <View style={styles.workoutGrid}>
          {templates.data.map((template: SessionTemplateResponse, index) => (
            <FadeIn key={template.id} style={styles.workoutCell} delay={(index + 4) * 30}>
              <Glass style={styles.workoutCard} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${template.name}`}
                  onPress={() => {
                    tick();
                    setEditingTemplate(template);
                    setMode('templateEditor');
                  }}
                  style={styles.workoutCardPress}
                >
                  <Text style={styles.nameRowText} numberOfLines={1}>
                    {template.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={2}>
                    {template.exercises.length}{' '}
                    {template.exercises.length === 1 ? 'exercise' : 'exercises'}
                    {template.exercises.length > 0
                      ? ` · ${template.exercises
                          .map((exercise) => exercise.exercise_name)
                          .join(' · ')}`
                      : ''}
                  </Text>
                </Pressable>
              </Glass>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
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
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  detailBackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailBackChevron: {
    color: theme.text,
    fontSize: 19,
    lineHeight: 19,
    fontWeight: '500',
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  splitsLabel: {
    marginTop: 22,
  },
  sectionHint: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  newBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  newBtnText: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  nameRow: {
    borderRadius: 18,
    paddingVertical: 17,
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  openRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRowText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: theme.textDim,
    fontSize: 20,
  },
  headerDeleteButton: {
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerDeleteText: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '700',
  },
  activeBadge: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  workoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  workoutCell: {
    width: '48.5%',
  },
  workoutCard: {
    borderRadius: 18,
    marginBottom: 10,
  },
  workoutCardPress: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 78,
  },
  notice: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  noticeText: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: '#E27878',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowCopy: {
    flex: 1,
    marginRight: 12,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayLabel: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  rowMeta: {
    color: theme.textDim,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 5,
  },
  detailDayList: {
    flex: 1,
  },
  detailDayListContent: {
    paddingBottom: 12,
  },
  activeControlSection: {
    flexShrink: 0,
    paddingTop: 10,
    paddingBottom: 24,
  },
  activeControlEyebrow: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 9,
    marginLeft: 4,
  },
  activeSlider: {
    height: ACTIVE_TRACK_HEIGHT,
    position: 'relative',
  },
  activeSliderTrack: {
    height: ACTIVE_TRACK_HEIGHT,
    borderRadius: ACTIVE_TRACK_HEIGHT / 2,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  activeSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: ACTIVE_TRACK_HEIGHT / 2,
    backgroundColor: theme.accent,
  },
  activeSliderLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.25,
    paddingLeft: ACTIVE_THUMB_SIZE / 2,
  },
  activeSliderReadyLabel: {
    ...StyleSheet.absoluteFillObject,
    color: theme.accent,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: (ACTIVE_TRACK_HEIGHT - 18) / 2,
    paddingLeft: ACTIVE_THUMB_SIZE / 2,
  },
  activeSliderThumbWrap: {
    position: 'absolute',
    left: ACTIVE_TRACK_PADDING,
    top: ACTIVE_TRACK_PADDING,
  },
  activeSliderThumb: {
    width: ACTIVE_THUMB_SIZE,
    height: ACTIVE_THUMB_SIZE,
    borderRadius: ACTIVE_THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  activeSliderThumbGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ACTIVE_THUMB_SIZE / 2,
    backgroundColor: theme.accent,
  },
  activeSliderChevron: {
    color: theme.text,
    fontSize: 31,
    fontWeight: '300',
    lineHeight: 34,
    marginTop: -2,
  },
  activeStatus: {
    minHeight: ACTIVE_TRACK_HEIGHT,
    borderRadius: ACTIVE_TRACK_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(63,209,139,0.3)',
  },
  activeStatusCheck: {
    width: 38,
    height: 38,
    borderRadius: 19,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(63,209,139,0.14)',
    color: theme.accent,
    fontSize: 17,
    fontWeight: '800',
    marginRight: 12,
  },
  activeStatusCopy: {
    flex: 1,
  },
  activeStatusTitle: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  activeStatusHint: {
    color: theme.textDim,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
});
