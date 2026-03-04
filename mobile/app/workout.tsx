import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Easing,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getActiveWorkout,
  setActiveWorkout,
  type Exercise,
  type WorkoutSet,
} from '../utils/activeWorkout';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPLITS = [
  { id: 'push', name: 'Push', desc: 'Chest, Shoulders, Triceps' },
  { id: 'pull', name: 'Pull', desc: 'Back, Biceps, Rear Delts' },
  { id: 'legs', name: 'Legs', desc: 'Quads, Hamstrings, Calves' },
  { id: 'upper', name: 'Upper', desc: 'Full Upper Body' },
  { id: 'lower', name: 'Lower', desc: 'Full Lower Body' },
  { id: 'custom', name: 'Custom', desc: 'Build your own' },
];

const EXERCISE_SUGGESTIONS: Record<string, string[]> = {
  push: ['Bench Press', 'Incline DB Press', 'OHP', 'Lateral Raises', 'Tricep Pushdowns', 'Cable Flyes'],
  pull: ['Barbell Rows', 'Pull-ups', 'Face Pulls', 'Barbell Curls', 'Cable Rows', 'Lat Pulldowns'],
  legs: ['Squats', 'Romanian Deadlifts', 'Leg Press', 'Leg Curls', 'Calf Raises', 'Bulgarian Split Squats'],
  upper: ['Bench Press', 'Barbell Rows', 'OHP', 'Pull-ups', 'Lateral Raises', 'Barbell Curls'],
  lower: ['Squats', 'Romanian Deadlifts', 'Leg Press', 'Walking Lunges', 'Leg Curls', 'Calf Raises'],
  custom: [],
};

// ─── Rest Timer ────────────────────────────────────────
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    Animated.timing(progress, {
      toValue: 0,
      duration: seconds * 1000,
      useNativeDriver: false,
    }).start();

    return () => clearInterval(interval);
  }, [seconds]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={timerStyles.container}>
      <View style={timerStyles.row}>
        <Ionicons name="timer-outline" size={16} color="#E8E8E8" />
        <Text style={timerStyles.text}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>
        <Pressable onPress={onDone} style={timerStyles.skipBtn}>
          <Text style={timerStyles.skipText}>Skip</Text>
        </Pressable>
      </View>
      <View style={timerStyles.barBg}>
        <Animated.View style={[timerStyles.barFill, { width: barWidth }]} />
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  text: { color: '#E8E8E8', fontSize: 18, fontWeight: '700', marginLeft: 8, fontVariant: ['tabular-nums'] },
  skipBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: '#2A2A2A' },
  skipText: { color: '#999', fontSize: 12, fontWeight: '600' },
  barBg: { height: 3, backgroundColor: '#2A2A2A', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#E8E8E8', borderRadius: 2 },
});

// ─── Slide to Finish ───────────────────────────────────
function SlideToFinish({ onFinish }: { onFinish: () => void }) {
  const TRACK_PADDING = 5;
  const THUMB_SIZE = 60;
  const TRACK_WIDTH = SCREEN_WIDTH - 48;
  const TRACK_HEIGHT = THUMB_SIZE + TRACK_PADDING * 2;
  const MAX_X = TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING * 2;

  const pan = useRef(new Animated.Value(0)).current;
  const thumbScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        if (triggered.current) return;
        const x = Math.max(0, Math.min(MAX_X, gs.dx));
        pan.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        if (triggered.current) return;
        const x = Math.max(0, Math.min(MAX_X, gs.dx));
        if (x >= MAX_X * 0.8) {
          triggered.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          Animated.parallel([
            Animated.spring(pan, {
              toValue: MAX_X,
              damping: 12,
              stiffness: 300,
              useNativeDriver: false,
            }),
            Animated.sequence([
              Animated.timing(thumbScale, {
                toValue: 1.3,
                duration: 150,
                useNativeDriver: false,
              }),
              Animated.spring(thumbScale, {
                toValue: 1.05,
                damping: 8,
                stiffness: 200,
                useNativeDriver: false,
              }),
            ]),
            Animated.timing(glowOpacity, {
              toValue: 1,
              duration: 300,
              useNativeDriver: false,
            }),
          ]).start();

          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onFinish();
          }, 500);
        } else {
          Animated.spring(pan, {
            toValue: 0,
            damping: 15,
            stiffness: 200,
            overshootClamping: true,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const textOpacity = pan.interpolate({
    inputRange: [0, MAX_X * 0.3],
    outputRange: [0.5, 0],
    extrapolate: 'clamp',
  });

  const fillWidth = pan.interpolate({
    inputRange: [0, MAX_X],
    outputRange: [THUMB_SIZE + TRACK_PADDING * 2, TRACK_WIDTH],
    extrapolate: 'clamp',
  });

  const fillColor = pan.interpolate({
    inputRange: [0, MAX_X * 0.5, MAX_X],
    outputRange: ['rgba(74, 222, 128, 0.08)', 'rgba(74, 222, 128, 0.15)', 'rgba(74, 222, 128, 0.25)'],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        slideStyles.track,
        { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2 },
      ]}
    >
      <Animated.View
        style={[
          slideStyles.fill,
          {
            width: fillWidth,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: fillColor,
          },
        ]}
      />
      {/* Completion glow */}
      <Animated.View
        style={[
          slideStyles.completionGlow,
          { opacity: glowOpacity, borderRadius: TRACK_HEIGHT / 2 },
        ]}
      />
      <Animated.Text style={[slideStyles.text, { opacity: textOpacity }]}>
        Slide to Finish
      </Animated.Text>
      <Animated.View
        style={[
          slideStyles.thumb,
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            left: TRACK_PADDING,
            transform: [{ translateX: pan }, { scale: thumbScale }],
          },
        ]}
        {...responder.panHandlers}
      >
        <Ionicons name="checkmark-sharp" size={24} color="#111" />
      </Animated.View>
    </View>
  );
}

const slideStyles = StyleSheet.create({
  track: {
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
  },
  completionGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
  },
  text: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
});

// ─── Main Workout Screen ───────────────────────────────
export default function WorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const resumeData = useRef(getActiveWorkout()).current;
  const isResumed = !!resumeData;

  const [phase, setPhase] = useState<'split' | 'log'>(isResumed ? 'log' : 'split');
  const [selectedSplit, setSelectedSplit] = useState(resumeData?.splitId || '');
  const [startedAt, setStartedAt] = useState(resumeData?.startedAt || 0);
  const [initialExercises] = useState<Exercise[] | null>(resumeData?.exercises || null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(isResumed ? SCREEN_HEIGHT : 0)).current;

  useEffect(() => {
    if (getActiveWorkout()) {
      setActiveWorkout(null);
    }
    if (isResumed) {
      Animated.spring(slideY, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  const slideOut = useCallback((callback: () => void) => {
    Animated.timing(slideY, {
      toValue: SCREEN_HEIGHT,
      duration: 180,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(callback);
  }, []);

  const fadeTransition = useCallback((nextPhase: 'split' | 'log') => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setPhase(nextPhase);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  const handleClose = () => {
    slideOut(() => router.back());
  };

  const handleSplitSelect = (splitId: string) => {
    setSelectedSplit(splitId);
    setStartedAt(Date.now());
    fadeTransition('log');
  };

  const handleBackToSplits = () => {
    fadeTransition('split');
  };

  const handleMinimize = (exercises: Exercise[]) => {
    const splitName = SPLITS.find(s => s.id === selectedSplit)?.name || '';
    setActiveWorkout({
      splitId: selectedSplit,
      splitName,
      exercises,
      startedAt,
    });
    slideOut(() => router.back());
  };

  const handleFinish = () => {
    setActiveWorkout(null);
    slideOut(() => router.back());
  };

  const handleCancel = () => {
    Alert.alert('Cancel Workout?', 'All progress will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel Workout',
        style: 'destructive',
        onPress: () => {
          setActiveWorkout(null);
          slideOut(() => router.back());
        },
      },
    ]);
  };

  return (
    <Animated.View style={[styles.root, { transform: [{ translateY: slideY }] }]}>
      <View style={[styles.safeTop, { height: insets.top }]} />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {phase === 'split' ? (
          <SplitPicker onSelect={handleSplitSelect} onClose={handleClose} />
        ) : (
          <ExerciseLogger
            splitId={selectedSplit}
            startedAt={startedAt}
            initialExercises={initialExercises}
            isResumed={isResumed}
            onBack={handleBackToSplits}
            onMinimize={handleMinimize}
            onFinish={handleFinish}
            onCancel={handleCancel}
          />
        )}
      </Animated.View>
      <View style={[styles.safeBottom, { height: insets.bottom }]} />
    </Animated.View>
  );
}

// ─── Split Picker ──────────────────────────────────────
function SplitPicker({
  onSelect,
  onClose,
}: {
  onSelect: (splitId: string) => void;
  onClose: () => void;
}) {
  const fadeAnims = useRef(SPLITS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(SPLITS.map(() => new Animated.Value(40))).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const [pressedId, setPressedId] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(headerFade, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    SPLITS.forEach((_, i) => {
      Animated.parallel([
        Animated.timing(fadeAnims[i], {
          toValue: 1,
          duration: 250,
          delay: 50 + i * 40,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnims[i], {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          delay: 50 + i * 40,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  return (
    <View style={styles.splitContainer}>
      <Animated.View style={[styles.header, { opacity: headerFade }]}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Ionicons name="chevron-down" size={26} color="#666" />
        </Pressable>
        <Text style={styles.headerTitle}>New Workout</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <Animated.View style={{ opacity: headerFade }}>
        <Text style={styles.prompt}>What are we hitting?</Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {SPLITS.map((split, i) => (
          <Animated.View
            key={split.id}
            style={{
              opacity: fadeAnims[i],
              transform: [{ translateY: slideAnims[i] }],
            }}
          >
            <Pressable
              onPressIn={() => setPressedId(split.id)}
              onPressOut={() => setPressedId(null)}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onSelect(split.id);
              }}
              style={[
                styles.splitRow,
                pressedId === split.id && styles.splitRowPressed,
              ]}
            >
              <View style={styles.splitRowLeft}>
                <View style={styles.letterBadge}>
                  <Text style={styles.letterText}>{split.name[0]}</Text>
                </View>
                <View style={styles.splitRowText}>
                  <Text style={styles.splitName}>{split.name}</Text>
                  <Text style={styles.splitDesc}>{split.desc}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#333" />
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Exercise Logger ───────────────────────────────────
function ExerciseLogger({
  splitId,
  startedAt,
  initialExercises,
  isResumed,
  onBack,
  onMinimize,
  onFinish,
  onCancel,
}: {
  splitId: string;
  startedAt: number;
  initialExercises: Exercise[] | null;
  isResumed: boolean;
  onBack: () => void;
  onMinimize: (exercises: Exercise[]) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises || []);
  const [showSuggestions, setShowSuggestions] = useState(!initialExercises);
  const [activeTimer, setActiveTimer] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const addExercise = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const now = Date.now();
    const newEx: Exercise = {
      id: now.toString(),
      name,
      sets: [
        { id: `${now}-1`, weight: '', reps: '', rpe: '', completed: false },
        { id: `${now}-2`, weight: '', reps: '', rpe: '', completed: false },
        { id: `${now}-3`, weight: '', reps: '', rpe: '', completed: false },
      ],
      notes: '',
      restSeconds: 120,
    };
    setExercises(prev => [...prev, newEx]);
    setShowSuggestions(false);
  };

  const addSet = (exId: string) => {
    setExercises(prev =>
      prev.map(ex =>
        ex.id === exId
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                { id: Date.now().toString(), weight: '', reps: '', rpe: '', completed: false },
              ],
            }
          : ex
      )
    );
  };

  const updateSet = (exId: string, setId: string, field: keyof WorkoutSet, value: string) => {
    setExercises(prev =>
      prev.map(ex =>
        ex.id === exId
          ? { ...ex, sets: ex.sets.map(s => (s.id === setId ? { ...s, [field]: value } : s)) }
          : ex
      )
    );
  };

  const toggleSetComplete = (exId: string, setId: string, restSec: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExercises(prev =>
      prev.map(ex =>
        ex.id === exId
          ? { ...ex, sets: ex.sets.map(s => (s.id === setId ? { ...s, completed: !s.completed } : s)) }
          : ex
      )
    );
    setActiveTimer(restSec);
  };

  const removeExercise = (exId: string) => {
    setExercises(prev => prev.filter(ex => ex.id !== exId));
  };

  const updateRestTime = (exId: string, seconds: number) => {
    setExercises(prev =>
      prev.map(ex => (ex.id === exId ? { ...ex, restSeconds: seconds } : ex))
    );
  };

  const updateNotes = (exId: string, notes: string) => {
    setExercises(prev =>
      prev.map(ex => (ex.id === exId ? { ...ex, notes } : ex))
    );
  };

  const suggestions = EXERCISE_SUGGESTIONS[splitId] || [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Top bar */}
      <View style={styles.logHeader}>
        {isResumed ? (
          <View style={{ width: 40 }} />
        ) : (
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color="#666" />
          </Pressable>
        )}
        <View style={styles.logHeaderCenter}>
          <Text style={styles.logTitle}>
            {SPLITS.find(s => s.id === splitId)?.name} Day
          </Text>
          <Text style={styles.logTime}>{formatElapsed(elapsed)}</Text>
        </View>
        <Pressable onPress={() => onMinimize(exercises)} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#666" />
        </Pressable>
      </View>

      {activeTimer !== null && (
        <RestTimer seconds={activeTimer} onDone={() => setActiveTimer(null)} />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.logScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.sugSection}>
            <Text style={styles.sugLabel}>Quick Add</Text>
            <View style={styles.sugGrid}>
              {suggestions.map(name => (
                <Pressable key={name} onPress={() => addExercise(name)} style={styles.sugChip}>
                  <Ionicons name="add" size={14} color="#ccc" />
                  <Text style={styles.sugChipText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {exercises.map(exercise => (
          <View key={exercise.id} style={styles.exCard}>
            <View style={styles.exHeader}>
              <Text style={styles.exName}>{exercise.name}</Text>
              <Pressable onPress={() => removeExercise(exercise.id)}>
                <Ionicons name="trash-outline" size={18} color="#555" />
              </Pressable>
            </View>

            <View style={styles.setHeaderRow}>
              <Text style={[styles.setHeaderText, { width: 32 }]}>Set</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>lbs</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
              <Text style={[styles.setHeaderText, { width: 44 }]}>RPE</Text>
              <View style={{ width: 36 }} />
            </View>

            {exercise.sets.map((set, si) => (
              <View
                key={set.id}
                style={[styles.setRow, set.completed && styles.setRowDone]}
              >
                <Text style={[styles.setNum, set.completed && styles.setNumDone]}>
                  {si + 1}
                </Text>
                <TextInput
                  style={[styles.setInput, set.completed && styles.inputDone]}
                  placeholder="—"
                  placeholderTextColor="#333"
                  keyboardType="numeric"
                  value={set.weight}
                  onChangeText={v => updateSet(exercise.id, set.id, 'weight', v)}
                />
                <TextInput
                  style={[styles.setInput, set.completed && styles.inputDone]}
                  placeholder="—"
                  placeholderTextColor="#333"
                  keyboardType="numeric"
                  value={set.reps}
                  onChangeText={v => updateSet(exercise.id, set.id, 'reps', v)}
                />
                <TextInput
                  style={[styles.rpeInput, set.completed && styles.inputDone]}
                  placeholder="—"
                  placeholderTextColor="#333"
                  keyboardType="numeric"
                  maxLength={2}
                  value={set.rpe}
                  onChangeText={v => updateSet(exercise.id, set.id, 'rpe', v)}
                />
                <Pressable
                  onPress={() => toggleSetComplete(exercise.id, set.id, exercise.restSeconds)}
                  style={[styles.checkBtn, set.completed && styles.checkBtnDone]}
                >
                  <Ionicons
                    name={set.completed ? 'checkmark' : 'checkmark-outline'}
                    size={16}
                    color={set.completed ? '#111' : '#555'}
                  />
                </Pressable>
              </View>
            ))}

            <View style={styles.exFooter}>
              <Pressable onPress={() => addSet(exercise.id)} style={styles.addSetBtn}>
                <Ionicons name="add" size={14} color="#888" />
                <Text style={styles.addSetText}>Add Set</Text>
              </Pressable>
              <View style={styles.restRow}>
                <Ionicons name="timer-outline" size={12} color="#555" />
                {[60, 90, 120, 180].map(sec => (
                  <Pressable
                    key={sec}
                    onPress={() => updateRestTime(exercise.id, sec)}
                    style={[styles.restChip, exercise.restSeconds === sec && styles.restChipOn]}
                  >
                    <Text
                      style={[
                        styles.restChipText,
                        exercise.restSeconds === sec && styles.restChipTextOn,
                      ]}
                    >
                      {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Notes..."
              placeholderTextColor="#333"
              value={exercise.notes}
              onChangeText={v => updateNotes(exercise.id, v)}
              multiline
            />
          </View>
        ))}

        <Pressable onPress={() => setShowSuggestions(true)} style={styles.addExBtn}>
          <Ionicons name="add-circle-outline" size={20} color="#888" />
          <Text style={styles.addExText}>Add Exercise</Text>
        </Pressable>

        {showSuggestions && (
          <View style={styles.customWrap}>
            <TextInput
              style={styles.customInput}
              placeholder="Or type exercise name..."
              placeholderTextColor="#444"
              returnKeyType="done"
              onSubmitEditing={e => {
                if (e.nativeEvent.text.trim()) addExercise(e.nativeEvent.text.trim());
              }}
            />
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Bottom: cancel + slider */}
      <View style={styles.bottomArea}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel Workout</Text>
        </Pressable>
        <SlideToFinish onFinish={onFinish} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  safeTop: {
    backgroundColor: '#0D0D0D',
  },
  safeBottom: {
    backgroundColor: '#0D0D0D',
  },
  content: {
    flex: 1,
  },

  // ── Shared ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Split picker ──
  splitContainer: { flex: 1 },
  prompt: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#1E1E1E',
  },
  splitRowPressed: { backgroundColor: '#1A1A1A', borderColor: '#333' },
  splitRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  letterBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
  },
  letterText: { color: '#E8E8E8', fontSize: 16, fontWeight: '800' },
  splitRowText: { gap: 2 },
  splitName: { color: '#E8E8E8', fontSize: 16, fontWeight: '700' },
  splitDesc: { color: '#555', fontSize: 12 },

  // ── Log header ──
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  logHeaderCenter: { alignItems: 'center' },
  logTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  logTime: { color: '#666', fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 1 },

  // ── Log content ──
  logScrollContent: { paddingTop: 12 },
  sugSection: { paddingHorizontal: 20, marginBottom: 16 },
  sugLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sugGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sugChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
    gap: 4,
  },
  sugChipText: { color: '#ccc', fontSize: 13 },

  exCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#222',
    overflow: 'hidden',
  },
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  exName: { color: '#E8E8E8', fontSize: 16, fontWeight: '700' },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  setHeaderText: {
    color: '#444',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 40,
  },
  setRowDone: { backgroundColor: 'rgba(232,232,232,0.03)' },
  setNum: { width: 32, color: '#555', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  setNumDone: { color: '#777' },
  setInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    color: '#E8E8E8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 3,
    fontVariant: ['tabular-nums'],
  },
  rpeInput: {
    width: 44,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    color: '#E8E8E8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 3,
    fontVariant: ['tabular-nums'],
  },
  inputDone: { backgroundColor: '#1E1E1E' },
  checkBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  checkBtnDone: { backgroundColor: '#E8E8E8' },
  exFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addSetText: { color: '#888', fontSize: 12, fontWeight: '600' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  restChipOn: { backgroundColor: '#E8E8E8' },
  restChipText: { color: '#555', fontSize: 10, fontWeight: '600' },
  restChipTextOn: { color: '#111' },
  notesInput: { paddingHorizontal: 16, paddingBottom: 12, color: '#666', fontSize: 12 },

  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderStyle: 'dashed',
    gap: 6,
    marginBottom: 8,
  },
  addExText: { color: '#888', fontSize: 14, fontWeight: '600' },
  customWrap: { paddingHorizontal: 16, marginBottom: 16 },
  customInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#E8E8E8',
    fontSize: 14,
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
  },

  bottomArea: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: 'center',
  },
  cancelBtn: {
    paddingVertical: 10,
  },
  cancelText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
});
