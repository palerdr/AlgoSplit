import { Tabs, useRouter, Redirect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { triggerExpandTransition } from '../../src/utils/workoutTransition';
import { useWorkoutStore } from '../../src/stores/workoutStore';
import { useAuth } from '../../src/hooks/useAuth';
import { prefetchDashboardQueries, prefetchHistoryQueries } from '../../src/hooks/useWorkouts';
import { prefetchSplitsQueries } from '../../src/hooks/useSplits';
import { Spinner } from '../../src/components/ui';
import StartWorkoutSheet from '../../src/components/workout/StartWorkoutSheet';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAG_THRESHOLD = -50;
const MAX_DRAG_UP = -120;

function ActiveWorkoutWidget() {
  const router = useRouter();
  const workout = useWorkoutStore((s) => s.activeWorkout);
  const [elapsed, setElapsed] = useState(0);
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!workout) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [workout]);

  if (!workout) return null;

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  const handlePressIn = () => {
    Animated.timing(pressScale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(pressScale, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/workout');
  };

  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.floatingWidget, { transform: [{ scale: pressScale }] }]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(74, 222, 128, 0.06)', 'rgba(74, 222, 128, 0.12)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.widgetGradient}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.widgetTitle}>{workout.sessionName}</Text>
        <Text style={styles.widgetTime}>{m}:{s.toString().padStart(2, '0')} elapsed</Text>
      </View>
      <Text style={styles.widgetAction}>Continue</Text>
      <Ionicons name="chevron-forward" size={14} color="#666" />
    </AnimatedPressable>
  );
}

function WorkoutButton({ onBlocked, onTrigger }: { onBlocked: () => void; onTrigger: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const hasTriggered = useRef(false);

  const isDisabled = useWorkoutStore((s) => !!s.activeWorkout);
  const isDisabledRef = useRef(isDisabled);
  isDisabledRef.current = isDisabled;

  // Refs to avoid stale closures inside PanResponder
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  const snapBack = useCallback(() => {
    hasTriggered.current = false;
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 12, stiffness: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [translateY, scale, glowOpacity]);

  const triggerWorkout = useCallback(() => {
    if (isDisabledRef.current) { onBlockedRef.current(); return; }
    if (hasTriggered.current) return;
    hasTriggered.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onTriggerRef.current();
    snapBack();
  }, [snapBack]);

  const triggerRef = useRef(triggerWorkout);
  triggerRef.current = triggerWorkout;
  const snapBackRef = useRef(snapBack);
  snapBackRef.current = snapBack;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        if (isDisabledRef.current) return;
        const clampedY = Math.max(MAX_DRAG_UP, Math.min(0, gs.dy));
        translateY.setValue(clampedY);
        const progress = Math.min(1, Math.abs(clampedY) / 80);
        scale.setValue(1 + progress * 0.15);
        glowOpacity.setValue(progress * 0.5);
        if (clampedY <= MAX_DRAG_UP) triggerRef.current();
      },
      onPanResponderRelease: (_, gs) => {
        if (isDisabledRef.current) {
          if (gs.dy > -5 && gs.dy < 5 && gs.dx > -5 && gs.dx < 5) onBlockedRef.current();
          return;
        }
        if (gs.dy < DRAG_THRESHOLD) triggerRef.current();
        else if (gs.dy > -5 && gs.dy < 5 && gs.dx > -5 && gs.dx < 5) triggerRef.current();
        else snapBackRef.current();
      },
      onPanResponderTerminate: () => snapBackRef.current(),
    })
  ).current;

  const glowScale = glowOpacity.interpolate({ inputRange: [0, 0.5], outputRange: [1, 1.6] });

  return (
    <View style={styles.workoutButtonWrapper} {...panResponder.panHandlers}>
      <Animated.View
        style={[styles.workoutGlow, { opacity: glowOpacity, transform: [{ translateY }, { scale: glowScale }] }]}
      />
      <Animated.View
        style={[styles.workoutButton, isDisabled && styles.workoutButtonDisabled, { transform: [{ translateY }, { scale }] }]}
      >
        <Animated.View style={{ opacity: iconOpacity }}>
          <Ionicons name="add" size={32} color={isDisabled ? '#888' : '#111'} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const msgVisible = useRef(false);
  const [showStartSheet, setShowStartSheet] = useState(false);

  const showBlockedMsg = useCallback(() => {
    if (msgVisible.current) return;
    msgVisible.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    msgOpacity.setValue(1);
    Animated.timing(msgOpacity, {
      toValue: 0, duration: 800, delay: 1200, useNativeDriver: true,
    }).start(() => { msgVisible.current = false; });
  }, [msgOpacity]);

  // Prefetch critical data on first mount (right after auth resolves)
  // so dashboard, splits, and history queries are warm before the user interacts.
  useEffect(() => {
    prefetchDashboardQueries(queryClient);
    prefetchSplitsQueries(queryClient);
    prefetchHistoryQueries(queryClient);
  }, [queryClient]);

  const handleStartQuick = useCallback(() => {
    useWorkoutStore.getState().startWorkout('Quick Workout');
    triggerExpandTransition();
  }, []);

  const handleStartSession = useCallback((
    sessionName: string,
    exercises: Array<{ name: string; sets: number; unilateral: boolean }>,
    sessionId?: string,
    splitId?: string,
  ) => {
    useWorkoutStore.getState().startWorkoutFromSession(sessionName, exercises, undefined, sessionId, splitId);
    triggerExpandTransition();
  }, []);

  if (!isLoading && !isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#E8E8E8',
          tabBarInactiveTintColor: '#555',
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
          }}
          listeners={{ tabPress: () => prefetchDashboardQueries(queryClient) }}
        />
        <Tabs.Screen
          name="splits"
          options={{
            title: 'Splits',
            tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} />,
          }}
          listeners={{ tabPress: () => prefetchSplitsQueries(queryClient) }}
        />
        <Tabs.Screen
          name="workout-placeholder"
          options={{ tabBarButton: () => <WorkoutButton onBlocked={showBlockedMsg} onTrigger={() => setShowStartSheet(true)} /> }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
          }}
          listeners={{ tabPress: () => prefetchHistoryQueries(queryClient) }}
        />
        <Tabs.Screen
          name="more"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
      <ActiveWorkoutWidget />
      <Animated.View pointerEvents="none" style={[styles.blockedMsg, { opacity: msgOpacity }]}>
        <Text style={styles.blockedMsgText}>Finish or cancel{'\n'}current workout</Text>
      </Animated.View>
      <StartWorkoutSheet
        visible={showStartSheet}
        onClose={() => setShowStartSheet(false)}
        onStartQuick={handleStartQuick}
        onStartSession={handleStartSession}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1A1A1A',
    borderTopColor: '#2A2A2A',
    borderTopWidth: 0.5,
    height: 88,
    paddingBottom: 28,
    paddingTop: 8,
    elevation: 0,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  workoutButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 60,
  },
  workoutButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  workoutButtonDisabled: {
    backgroundColor: '#444',
    shadowOpacity: 0,
  },
  workoutGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8E8E8',
  },
  blockedMsg: {
    position: 'absolute',
    top: SCREEN_HEIGHT / 2 - 24,
    alignSelf: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  blockedMsgText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingWidget: {
    position: 'absolute',
    bottom: 104,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  widgetGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  widgetTitle: {
    color: '#E8E8E8',
    fontSize: 14,
    fontWeight: '700',
  },
  widgetTime: {
    color: '#666',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  widgetAction: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
});
