import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppStateProvider } from './src/state/AppState';
import { theme } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import SessionScreen from './src/screens/SessionScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';

// Deliberately barebones navigation: one state value, no navigator dependency.
// Screens hand off through a quick, subtle fade: a dark overlay fades over the
// old screen, we swap, and it lifts off the new one. No transforms on the
// content — keeps it cheap on heavy screens. IMPORTANT: the screens themselves
// are never opacity-animated — iOS glass effects (GlassView) break, sometimes
// permanently, when any ancestor view animates opacity. The fade lives on a
// sibling overlay instead.
type Screen = 'home' | 'session' | 'details' | 'workouts';

function Root() {
  const [shown, setShown] = useState<Screen>('home');
  // Finishing a workout lands on Home in celebration mode: the same body
  // model spins with the session's stimulus, then the normal UI settles in.
  // A one-shot flag (cleared by Home once handled) — NOT a persistent key, so
  // ordinary navigation back to Home never replays the celebration.
  const [celebratePending, setCelebratePending] = useState(false);
  // One-shot: Home's "+" tile opens Workouts directly in the builder.
  const [builderPending, setBuilderPending] = useState(false);
  const pendingRef = useRef<Screen | null>(null);
  const anim = useRef(new Animated.Value(1)).current;

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

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [shown, anim]);

  const screen = (() => {
    switch (shown) {
      case 'home':
        return (
          <HomeScreen
            celebrate={celebratePending}
            onCelebrateHandled={() => setCelebratePending(false)}
            onStartSession={() => go('session')}
            onDetails={() => go('details')}
            onWorkouts={() => go('workouts')}
            onNewWorkout={() => {
              setBuilderPending(true);
              go('workouts');
            }}
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
            startInBuilder={builderPending}
            onBuilderHandled={() => setBuilderPending(false)}
          />
        );
    }
  })();

  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>{screen}</View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
});

export default function App() {
  return (
    <AppStateProvider>
      <StatusBar style="light" />
      <Root />
    </AppStateProvider>
  );
}
