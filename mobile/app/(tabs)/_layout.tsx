import { Tabs, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { useRef, useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { triggerExpandTransition } from '../../utils/workoutTransition';
import { getActiveWorkout, subscribe } from '../../utils/activeWorkout';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAG_THRESHOLD = -50;
const MAX_DRAG_UP = -120;

function useActiveWorkout() {
  const [workout, setWorkout] = useState(getActiveWorkout());
  useEffect(() => subscribe(() => setWorkout(getActiveWorkout())), []);
  return workout;
}

function ActiveWorkoutWidget() {
  const router = useRouter();
  const workout = useActiveWorkout();
  const [elapsed, setElapsed] = useState(0);
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!workout) return;
    const update = () => setElapsed(Math.floor((Date.now() - workout.startedAt) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [workout]);

  if (!workout) return null;

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  const handlePressIn = () => {
    Animated.timing(pressScale, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
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
        <Text style={styles.widgetTitle}>{workout.splitName} Day</Text>
        <Text style={styles.widgetTime}>{m}:{s.toString().padStart(2, '0')} elapsed</Text>
      </View>
      <Text style={styles.widgetAction}>Continue</Text>
      <Ionicons name="chevron-forward" size={14} color="#666" />
    </AnimatedPressable>
  );
}

function TopBlurGradient() {
  return (
    <View style={styles.topBlurContainer} pointerEvents="none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0.4)', 'transparent']}
            locations={[0, 0.5, 1]}
            style={{ flex: 1 }}
          />
        }
      >
        <BlurView intensity={50} tint="dark" style={{ flex: 1 }} />
      </MaskedView>
      <LinearGradient
        colors={['rgba(13,13,13,0.9)', 'rgba(13,13,13,0.6)', 'rgba(13,13,13,0.2)', 'transparent']}
        locations={[0, 0.25, 0.5, 0.75]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function BottomBlurGradient() {
  const workout = useActiveWorkout();
  if (!workout) return null;

  return (
    <View style={styles.bottomBlurContainer} pointerEvents="none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,1)']}
            locations={[0, 0.5, 1]}
            style={{ flex: 1 }}
          />
        }
      >
        <BlurView intensity={50} tint="dark" style={{ flex: 1 }} />
      </MaskedView>
    </View>
  );
}

function WorkoutButton({ onBlocked }: { onBlocked: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const hasTriggered = useRef(false);

  const [isDisabled, setIsDisabled] = useState(!!getActiveWorkout());
  const isDisabledRef = useRef(isDisabled);
  isDisabledRef.current = isDisabled;

  useEffect(() => subscribe(() => {
    const disabled = !!getActiveWorkout();
    setIsDisabled(disabled);
  }), []);

  const triggerWorkout = () => {
    if (isDisabledRef.current) {
      onBlocked();
      return;
    }
    if (hasTriggered.current) return;
    hasTriggered.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.3,
        duration: 250,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(iconOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    triggerExpandTransition();

    setTimeout(() => {
      translateY.setValue(0);
      scale.setValue(1);
      glowOpacity.setValue(0);
      iconOpacity.setValue(1);
      hasTriggered.current = false;
    }, 1000);
  };

  const snapBack = () => {
    hasTriggered.current = false;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 12,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

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
        if (clampedY <= MAX_DRAG_UP) {
          triggerWorkout();
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (isDisabledRef.current) {
          if (gs.dy > -5 && gs.dy < 5 && gs.dx > -5 && gs.dx < 5) {
            onBlocked();
          }
          return;
        }
        if (gs.dy < DRAG_THRESHOLD) {
          triggerWorkout();
        } else if (gs.dy > -5 && gs.dy < 5 && gs.dx > -5 && gs.dx < 5) {
          triggerWorkout();
        } else {
          snapBack();
        }
      },
      onPanResponderTerminate: () => {
        snapBack();
      },
    })
  ).current;

  const glowScale = glowOpacity.interpolate({
    inputRange: [0, 0.5],
    outputRange: [1, 1.6],
  });

  return (
    <View style={styles.workoutButtonWrapper} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.workoutGlow,
          {
            opacity: glowOpacity,
            transform: [{ translateY }, { scale: glowScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.workoutButton,
          isDisabled && styles.workoutButtonDisabled,
          { transform: [{ translateY }, { scale }] },
        ]}
      >
        <Animated.View style={{ opacity: iconOpacity }}>
          <Ionicons name="add" size={32} color={isDisabled ? '#888' : '#111'} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const msgVisible = useRef(false);

  const showBlockedMsg = useCallback(() => {
    if (msgVisible.current) return;
    msgVisible.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    msgOpacity.setValue(1);
    Animated.timing(msgOpacity, {
      toValue: 0,
      duration: 800,
      delay: 1200,
      useNativeDriver: true,
    }).start(() => { msgVisible.current = false; });
  }, []);

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
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="splits"
          options={{
            title: 'Splits',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="barbell-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="workout-placeholder"
          options={{
            tabBarButton: () => <WorkoutButton onBlocked={showBlockedMsg} />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <TopBlurGradient />
      <BottomBlurGradient />
      <ActiveWorkoutWidget />
      {/* Blocked message — centered on screen */}
      <Animated.View
        pointerEvents="none"
        style={[styles.blockedMsg, { opacity: msgOpacity }]}
      >
        <Text style={styles.blockedMsgText}>
          Finish or cancel{'\n'}current workout
        </Text>
      </Animated.View>
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

  // ── Blur gradients ──
  topBlurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    overflow: 'hidden',
    zIndex: 10,
  },
  bottomBlurContainer: {
    position: 'absolute',
    bottom: 88,
    left: 0,
    right: 0,
    height: 180,
    overflow: 'hidden',
  },

  // ── Blocked message — centered on screen ──
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

  // ── Floating active workout widget ──
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
