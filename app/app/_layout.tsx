import '../src/dev/registerDevTools';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useRef, useEffect, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/hooks/useAuth';
import { registerTransitionHandler } from '../src/utils/workoutTransition';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

export default function RootLayout() {
  const router = useRouter();
  const expandScale = useRef(new Animated.Value(0)).current;
  const wrapperOpacity = useRef(new Animated.Value(1)).current;
  const darkFade = useRef(new Animated.Value(0)).current;
  const [showOverlay, setShowOverlay] = useState(false);

  const handleTransition = useCallback(() => {
    setShowOverlay(true);
    expandScale.setValue(0.8);
    wrapperOpacity.setValue(1);
    darkFade.setValue(0);

    Animated.parallel([
      Animated.timing(expandScale, {
        toValue: 40,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(darkFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      router.push('/workout');
      setTimeout(() => {
        Animated.timing(wrapperOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          setShowOverlay(false);
          expandScale.setValue(0);
          wrapperOpacity.setValue(1);
          darkFade.setValue(0);
        });
      }, 30);
    });
  }, []);

  useEffect(() => {
    registerTransitionHandler(handleTransition);
  }, [handleTransition]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestureHandlerRootView style={styles.container}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
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
