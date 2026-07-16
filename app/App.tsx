import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStateProvider } from './src/state/AppState';
import { AccountStateProvider } from './src/state/AccountState';
import { useAccountState } from './src/state/AccountState';
import { theme } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import SessionScreen from './src/screens/SessionScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { recoveryTokenFromUrl } from './src/auth/recoveryLink';

// Deliberately barebones navigation: one state value, no navigator dependency.
// Screens hand off through a quick, subtle fade: a dark overlay fades over the
// old screen, we swap, and it lifts off the new one. No transforms on the
// content — keeps it cheap on heavy screens. IMPORTANT: the screens themselves
// are never opacity-animated — iOS glass effects (GlassView) break, sometimes
// permanently, when any ancestor view animates opacity. The fade lives on a
// sibling overlay instead.
type Screen = 'home' | 'session' | 'details' | 'workouts' | 'account' | 'privacy';

function Root() {
  const account = useAccountState();
  const [shown, setShown] = useState<Screen>('home');
  // Finishing a workout lands on Home in celebration mode: the same body
  // model spins with the session's stimulus, then the normal UI settles in.
  // A one-shot flag (cleared by Home once handled) — NOT a persistent key, so
  // ordinary navigation back to Home never replays the celebration.
  const [celebratePending, setCelebratePending] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
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

  useEffect(() => {
    if (account.status !== 'authenticated') {
      pendingRef.current = null;
      setShown('home');
      setCelebratePending(false);
    }
  }, [account.status]);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const token = recoveryTokenFromUrl(url);
      if (token) setRecoveryToken(token);
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  if (recoveryToken) {
    return <ResetPasswordScreen token={recoveryToken} onDone={() => setRecoveryToken(null)} />;
  }

  if (account.status !== 'authenticated') return <AuthScreen />;

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
            onAccount={() => go('account')}
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
