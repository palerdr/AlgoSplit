import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStateProvider, useAppState } from './src/state/AppState';
import { AccountStateProvider } from './src/state/AccountState';
import { useAccountState } from './src/state/AccountState';
import { theme } from './src/theme';
import HomeScreen, { WorkoutLaunchRequest } from './src/screens/HomeScreen';
import SessionScreen from './src/screens/SessionScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import WorkoutLaunchSplash from './src/ui/WorkoutLaunchSplash';
import WorkoutOrderDeck, { WorkoutOrderDeckItem } from './src/ui/WorkoutOrderDeck';
import { recoveryTokenFromUrl } from './src/auth/recoveryLink';

// Deliberately barebones navigation: one state value, no navigator dependency.
// Screens hand off through a quick, subtle fade: a dark overlay fades over the
// old screen, we swap, and it lifts off the new one. No transforms on the
// content — keeps it cheap on heavy screens. IMPORTANT: the screens themselves
// are never opacity-animated — iOS glass effects (GlassView) break, sometimes
// permanently, when any ancestor view animates opacity. The fade lives on a
// sibling overlay instead.
type Screen =
  | 'home'
  | 'session'
  | 'details'
  | 'workouts'
  | 'workouts-new-split'
  | 'account'
  | 'privacy';

interface RootWorkoutLaunch {
  key: number;
  request: WorkoutLaunchRequest;
  phase: 'covering' | 'reviewing' | 'revealing' | 'canceling';
  draft: {
    key: string;
    sourceIndex: number;
    name: string;
    targetSets: number;
    warmupEnabled: boolean;
  }[];
}

function Root() {
  const account = useAccountState();
  const appState = useAppState();
  const [shown, setShown] = useState<Screen>('home');
  // Finishing a workout lands on Home in celebration mode: the same body
  // model spins with the session's stimulus, then the normal UI settles in.
  // A one-shot flag (cleared by Home once handled) — NOT a persistent key, so
  // ordinary navigation back to Home never replays the celebration.
  const [celebratePending, setCelebratePending] = useState(false);
  const [activeSplitLanding, setActiveSplitLanding] = useState<{
    splitId: string;
    token: number;
  } | null>(null);
  const activeSplitLandingTokenRef = useRef(0);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const pendingRef = useRef<Screen | null>(null);
  const anim = useRef(new Animated.Value(1)).current;
  const [workoutLaunch, setWorkoutLaunch] = useState<RootWorkoutLaunch | null>(null);
  const workoutLaunchRef = useRef<RootWorkoutLaunch | null>(null);
  const workoutLaunchKeyRef = useRef(0);
  const workoutOrderDraggingRef = useRef(false);

  const go = (next: Screen) => {
    if (next === shown) return;
    pendingRef.current = next;
    Animated.timing(anim, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || pendingRef.current === null) return;
      // Swap only — the reveal starts from the effect below, AFTER the new
      // screen has committed and painted behind the opaque overlay. Starting
      // it here would lift the overlay off the OLD screen while a heavy new
      // screen is still mounting, then snap.
      setShown(pendingRef.current);
      pendingRef.current = null;
    });
  };

  const startWorkoutTransition = (request: WorkoutLaunchRequest) => {
    if (workoutLaunchRef.current) return false;

    // Workout launches use the water wipe exclusively. Cancel any pending
    // sibling fade so the pool is the only transition covering Home.
    pendingRef.current = null;
    anim.stopAnimation();
    anim.setValue(1);
    const key = ++workoutLaunchKeyRef.current;
    const launch: RootWorkoutLaunch = {
      key,
      request,
      phase: 'covering',
      draft:
        request.kind === 'planned'
          ? request.plan.exercises.map(({ exercise, sets }, sourceIndex) => ({
              key: `launch-${key}-${sourceIndex}`,
              sourceIndex,
              name: exercise.name,
              targetSets: sets,
              warmupEnabled: false,
            }))
          : [],
    };
    workoutOrderDraggingRef.current = false;
    workoutLaunchRef.current = launch;
    setWorkoutLaunch(launch);
    return true;
  };

  const coverWorkoutTransition = (key: number) => {
    const launch = workoutLaunchRef.current;
    if (!launch || launch.key !== key || launch.phase !== 'covering') return;

    // Planned workouts pause on the fully green pool for a local review. The
    // live session is intentionally not created yet, so this decision time is
    // not counted as workout duration and Cancel needs no rollback.
    if (launch.request.kind === 'planned' && launch.draft.length > 0) {
      const reviewing = { ...launch, phase: 'reviewing' as const };
      workoutLaunchRef.current = reviewing;
      setWorkoutLaunch(reviewing);
      return;
    }

    if (launch.request.kind === 'freestyle') {
      appState.startFreeSession();
    } else {
      appState.startPlannedSession(launch.request.plan);
    }
    pendingRef.current = null;
    anim.stopAnimation();
    anim.setValue(1);
    setShown('session');
    const revealing = { ...launch, phase: 'revealing' as const };
    workoutLaunchRef.current = revealing;
    setWorkoutLaunch(revealing);
  };

  const cancelWorkoutTransition = (key: number) => {
    const launch = workoutLaunchRef.current;
    if (
      !launch ||
      launch.key !== key ||
      launch.phase !== 'reviewing' ||
      workoutOrderDraggingRef.current
    ) return;
    const canceling = { ...launch, phase: 'canceling' as const };
    workoutLaunchRef.current = canceling;
    setWorkoutLaunch(canceling);
  };

  const reorderWorkoutDraft = (key: number, orderedItems: WorkoutOrderDeckItem[]) => {
    const launch = workoutLaunchRef.current;
    if (!launch || launch.key !== key || launch.phase !== 'reviewing') return;
    const byKey = new Map(launch.draft.map((item) => [item.key, item]));
    const draft = orderedItems
      .map((item) => byKey.get(item.key))
      .filter((item): item is RootWorkoutLaunch['draft'][number] => Boolean(item));
    if (draft.length !== launch.draft.length) return;
    const reviewing = { ...launch, draft };
    workoutLaunchRef.current = reviewing;
    setWorkoutLaunch(reviewing);
  };

  const setWorkoutDraftWarmup = (key: number, itemKey: string, enabled: boolean) => {
    const launch = workoutLaunchRef.current;
    if (!launch || launch.key !== key || launch.phase !== 'reviewing') return;
    const reviewing = {
      ...launch,
      draft: launch.draft.map((item) =>
        item.key === itemKey ? { ...item, warmupEnabled: enabled } : item
      ),
    };
    workoutLaunchRef.current = reviewing;
    setWorkoutLaunch(reviewing);
  };

  const confirmWorkoutTransition = (key: number) => {
    const launch = workoutLaunchRef.current;
    if (
      !launch ||
      launch.key !== key ||
      launch.phase !== 'reviewing' ||
      launch.request.kind !== 'planned' ||
      workoutOrderDraggingRef.current
    ) return;

    appState.startPlannedSession(
      launch.request.plan,
      launch.draft.map(({ sourceIndex, warmupEnabled }) => ({
        sourceIndex,
        warmupEnabled,
      }))
    );
    pendingRef.current = null;
    anim.stopAnimation();
    anim.setValue(1);
    setShown('session');
    const revealing = { ...launch, phase: 'revealing' as const };
    workoutLaunchRef.current = revealing;
    setWorkoutLaunch(revealing);
  };

  const finishWorkoutTransition = (key: number) => {
    if (workoutLaunchRef.current?.key !== key) return;
    workoutOrderDraggingRef.current = false;
    workoutLaunchRef.current = null;
    setWorkoutLaunch(null);
  };

  useEffect(() => {
    if (!workoutLaunch) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Keep the water handoff atomic. At the review hold, Android Back has
      // the same behavior as the visible Cancel action.
      if (workoutLaunchRef.current?.phase === 'reviewing') {
        if (!workoutOrderDraggingRef.current) {
          cancelWorkoutTransition(workoutLaunchRef.current.key);
        }
      }
      return true;
    });
    return () => subscription.remove();
  }, [workoutLaunch?.key]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [shown, anim]);

  useEffect(() => {
    if (
      account.status !== 'authenticated' ||
      !appState.session ||
      shown !== 'home' ||
      workoutLaunchRef.current
    ) return;
    // A process restart always initializes the lightweight navigator at Home.
    // Once account-scoped storage restores a live workout, return directly to
    // it without replaying the launch animation or resetting its start time.
    pendingRef.current = null;
    anim.stopAnimation();
    anim.setValue(1);
    setShown('session');
  }, [account.status, appState.session, shown, anim]);

  useEffect(() => {
    if (account.status !== 'authenticated') {
      pendingRef.current = null;
      workoutLaunchRef.current = null;
      workoutOrderDraggingRef.current = false;
      setWorkoutLaunch(null);
      setShown('home');
      setCelebratePending(false);
      setActiveSplitLanding(null);
      return;
    }
    if (account.authReturnScreen) {
      pendingRef.current = null;
      workoutLaunchRef.current = null;
      workoutOrderDraggingRef.current = false;
      setWorkoutLaunch(null);
      setShown(account.authReturnScreen);
      account.clearAuthReturnScreen();
    }
  }, [account.authReturnScreen, account.clearAuthReturnScreen, account.status]);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const token = recoveryTokenFromUrl(url);
      if (!token) return;
      pendingRef.current = null;
      workoutLaunchRef.current = null;
      workoutOrderDraggingRef.current = false;
      setWorkoutLaunch(null);
      setRecoveryToken(token);
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  if (recoveryToken) {
    return <ResetPasswordScreen token={recoveryToken} onDone={() => setRecoveryToken(null)} />;
  }

  if (account.status !== 'authenticated') return <AuthScreen />;

  const landNewActiveSplit = (splitId: string) => {
    setActiveSplitLanding({
      splitId,
      token: ++activeSplitLandingTokenRef.current,
    });
    go('home');
  };

  const screen = (() => {
    switch (shown) {
      case 'home':
        return (
          <HomeScreen
            celebrate={celebratePending}
            onCelebrateHandled={() => setCelebratePending(false)}
            onStartSession={startWorkoutTransition}
            onDetails={() => go('details')}
            onWorkouts={() => go('workouts')}
            onCreateSplit={() => go('workouts-new-split')}
            onAccount={() => go('account')}
            activeSplitLanding={activeSplitLanding}
            onActiveSplitLandingHandled={() => setActiveSplitLanding(null)}
          />
        );
      case 'session':
        return (
          <SessionScreen
            onComplete={() => {
              setCelebratePending(true);
              go('home');
            }}
            onDiscard={() => go('home')}
          />
        );
      case 'details':
        return <DetailsScreen onBack={() => go('home')} />;
      case 'workouts':
        return (
          <WorkoutsScreen
            onBack={() => go('home')}
            onActiveSplitSet={landNewActiveSplit}
          />
        );
      case 'workouts-new-split':
        return (
          <WorkoutsScreen
            onBack={() => go('home')}
            startInSplitCreation
            onActiveSplitSet={landNewActiveSplit}
          />
        );
      case 'account':
        return <AccountScreen onBack={() => go('home')} onPrivacy={() => go('privacy')} />;
      case 'privacy':
        return <PrivacyScreen onBack={() => go('account')} />;
    }
  })();

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={Boolean(workoutLaunch)}
        importantForAccessibility={workoutLaunch ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1 }}
      >
        {screen}
      </View>
      {/* the fade lives on a sibling overlay, never on the screen itself */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.bg,
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          },
        ]}
      />
      {workoutLaunch && (
        <WorkoutLaunchSplash
          key={workoutLaunch.key}
          workoutName={workoutLaunch.request.workoutName}
          phase={workoutLaunch.phase}
          onCovered={() => coverWorkoutTransition(workoutLaunch.key)}
          onFinished={() => finishWorkoutTransition(workoutLaunch.key)}
        >
          {workoutLaunch.request.kind === 'planned' && (
            <View style={styles.orderReviewWrap}>
              <WorkoutOrderDeck
                variant="preflight"
                items={workoutLaunch.draft.map((item) => ({
                  key: item.key,
                  name: item.name,
                  targetSets: item.targetSets,
                  completedSets: 0,
                  warmupEnabled: item.warmupEnabled,
                  warmupLocked: false,
                  current: false,
                  draggable: true,
                }))}
                onReorder={(items) => reorderWorkoutDraft(workoutLaunch.key, items)}
                onWarmupChange={(itemKey, enabled) =>
                  setWorkoutDraftWarmup(workoutLaunch.key, itemKey, enabled)
                }
                onDragStateChange={(dragging) => {
                  workoutOrderDraggingRef.current = dragging;
                }}
                onCancel={() => cancelWorkoutTransition(workoutLaunch.key)}
                onPrimaryAction={() => confirmWorkoutTransition(workoutLaunch.key)}
                title="Review Workout"
                subtitle={workoutLaunch.request.workoutName}
                primaryLabel="Start"
              />
            </View>
          )}
        </WorkoutLaunchSplash>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  orderReviewWrap: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 20,
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AccountStateProvider>
        <AppStateProvider>
          <StatusBar style="light" />
          <Root />
        </AppStateProvider>
      </AccountStateProvider>
    </GestureHandlerRootView>
  );
}
