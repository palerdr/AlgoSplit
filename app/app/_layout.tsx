import '../src/dev/registerDevTools';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Animated, Easing, Dimensions, AppState, Platform } from 'react-native';
import { useRef, useEffect, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { AuthProvider } from '../src/hooks/useAuth';
import { registerTransitionHandler } from '../src/utils/workoutTransition';

function extractToken(url: string): string | undefined {
  const hashIdx = url.indexOf('#');
  const search = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const params = new URLSearchParams(search);
  const fromHash = params.get('access_token');
  if (fromHash) return fromHash;
  const qIdx = url.indexOf('?');
  if (qIdx >= 0) {
    const qp = new URLSearchParams(url.slice(qIdx + 1));
    return qp.get('token') ?? qp.get('access_token') ?? undefined;
  }
  return undefined;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const USE_NATIVE_TRANSITION_DRIVER = Platform.OS !== 'web';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,    // survive tab switches without refetching
      refetchOnWindowFocus: false, // avoid refetch storms on app resume
    },
  },
});

// Export so AuthProvider can prefetch after login
export { queryClient };

export default function RootLayout() {
  const router = useRouter();
  const routerRef = useRef(router);
  const expandScale = useRef(new Animated.Value(0)).current;
  const wrapperOpacity = useRef(new Animated.Value(1)).current;
  const darkFade = useRef(new Animated.Value(0)).current;
  const transitionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const clearTransitionTimers = useCallback(() => {
    transitionTimers.current.forEach((timer) => clearTimeout(timer));
    transitionTimers.current = [];
  }, []);

  const resetTransitionOverlay = useCallback(() => {
    clearTransitionTimers();
    expandScale.stopAnimation();
    wrapperOpacity.stopAnimation();
    darkFade.stopAnimation();
    setShowOverlay(false);
    expandScale.setValue(0);
    wrapperOpacity.setValue(1);
    darkFade.setValue(0);
  }, [clearTransitionTimers, darkFade, expandScale, wrapperOpacity]);

  const handleTransition = useCallback(() => {
    clearTransitionTimers();
    expandScale.stopAnimation();
    wrapperOpacity.stopAnimation();
    darkFade.stopAnimation();

    setShowOverlay(true);
    expandScale.setValue(0.8);
    wrapperOpacity.setValue(1);
    darkFade.setValue(0);

    let didNavigate = false;
    let didFadeOut = false;

    const navigateToWorkout = () => {
      if (didNavigate) return;
      didNavigate = true;
      routerRef.current.push('/workout');
    };

    const fadeOutOverlay = () => {
      if (didFadeOut) return;
      didFadeOut = true;
      Animated.timing(wrapperOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: USE_NATIVE_TRANSITION_DRIVER,
      }).start(() => {
        resetTransitionOverlay();
      });
    };

    // Navigation and cleanup are intentionally timer-backed. The white circle
    // animation is visual polish; a dropped Animated callback should never
    // strand the user behind an overlay or block the workout route.
    transitionTimers.current = [
      setTimeout(navigateToWorkout, 260),
      setTimeout(fadeOutOverlay, 620),
      setTimeout(resetTransitionOverlay, 1200),
    ];

    Animated.parallel([
      Animated.timing(expandScale, {
        toValue: 40,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: USE_NATIVE_TRANSITION_DRIVER,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(darkFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: USE_NATIVE_TRANSITION_DRIVER,
        }),
      ]),
    ]).start(() => {
      navigateToWorkout();
      transitionTimers.current.push(setTimeout(fadeOutOverlay, 30));
    });
  }, [clearTransitionTimers, darkFade, expandScale, resetTransitionOverlay, wrapperOpacity]);

  useEffect(() => {
    const unregisterTransitionHandler = registerTransitionHandler(handleTransition);
    return () => {
      resetTransitionOverlay();
      unregisterTransitionHandler();
    };
  }, [handleTransition, resetTransitionOverlay]);

  // Deep-link handler for password-reset URLs (e.g. algosplit://reset-password
  // #access_token=XYZ&type=recovery from Supabase recovery emails, or a query
  // string variant ?token=XYZ).
  useEffect(() => {
    // On cold-start, iOS/Android can fire both getInitialURL and the 'url'
    // event for the same launching URL. Dedup within a 1s window.
    let lastHandled: { url: string; ts: number } | null = null;
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes('reset-password')) return;
      const now = Date.now();
      if (lastHandled && lastHandled.url === url && now - lastHandled.ts < 1000) return;
      lastHandled = { url, ts: now };
      const token = extractToken(url);
      // Defer one tick so the Stack navigator is mounted before pushing on cold-start.
      setTimeout(() => {
        router.push({
          pathname: '/(auth)/reset-password',
          params: token ? { token } : {},
        });
      }, 0);
    };

    Linking.getInitialURL().then((url) => handleUrl(url)).catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [router]);

  // Reconcile expo-router nav state when the app resumes from background or
  // a browser tab regains focus.  If a workout modal is stranded (activeWorkout
  // is null but the modal route is still on the stack), dismiss it so the user
  // lands back on the tabs screen cleanly.
  useEffect(() => {
    const reconcile = () => {
      const { activeWorkout } = require('../src/stores/workoutStore').useWorkoutStore.getState();
      // If no active workout but the modal might be stranded, let the
      // workout screen's own empty-state + canDismiss guard handle it.
      // We only need to force-dismiss if the router thinks it can.
      if (!activeWorkout && router.canDismiss()) {
        router.dismiss();
      }
    };

    if (Platform.OS === 'web') {
      const handler = () => {
        if (document.visibilityState === 'visible') reconcile();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile();
    });
    return () => sub.remove();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestureHandlerRootView style={styles.container}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen
              name="workout"
              options={{
                presentation: 'transparentModal',
                animation: 'none',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack>
          {showOverlay && (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { opacity: wrapperOpacity }]}
            >
              <Animated.View
                style={[styles.expandCircle, { transform: [{ scale: expandScale }] }]}
              />
              <Animated.View style={[styles.darkOverlay, { opacity: darkFade }]} />
            </Animated.View>
          )}
        </GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  expandCircle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8E8E8',
    bottom: 24,
    left: SCREEN_WIDTH / 2 - 30,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0D',
  },
});
