import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { colors } from '../../theme';

export default function RestTimerMobile() {
  const restTimer = useWorkoutStore((s) => s.restTimer);
  const tickRestTimer = useWorkoutStore((s) => s.tickRestTimer);
  const stopRestTimer = useWorkoutStore((s) => s.stopRestTimer);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);
  const restDuration = useSettingsStore((s) => s.restDuration);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!restTimer.isRunning) return;
    const id = setInterval(tickRestTimer, 1000);
    return () => clearInterval(id);
  }, [restTimer.isRunning, tickRestTimer]);

  // Haptic when timer expires (isRunning goes false while remaining hits 0)
  useEffect(() => {
    if (restTimer.isRunning) {
      wasRunning.current = true;
      return;
    }
    if (wasRunning.current && restTimer.remaining === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      wasRunning.current = false;
    }
  }, [restTimer.isRunning, restTimer.remaining]);

  if (!restTimer.isRunning && restTimer.remaining === 0) return null;

  const minutes = Math.floor(restTimer.remaining / 60);
  const seconds = restTimer.remaining % 60;
  const isExpired = restTimer.remaining === 0;

  return (
    <View style={[styles.container, isExpired && styles.containerExpired]}>
      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            { width: `${(restTimer.remaining / restTimer.duration) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.body}>
        <View>
          <Text style={styles.label}>Rest</Text>
          <Text style={[styles.time, isExpired && styles.timeExpired]}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </Text>
        </View>
        <View style={styles.actions}>
          {isExpired ? (
            <TouchableOpacity onPress={() => startRestTimer(restDuration)} style={styles.actionBtn} hitSlop={6}>
              <Ionicons name="play" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={stopRestTimer} style={styles.actionBtn} hitSlop={6}>
              <Ionicons name="play-skip-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={stopRestTimer} style={styles.actionBtn} hitSlop={6}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    minWidth: 140,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  containerExpired: {
    borderColor: colors.green,
  },
  progressBg: {
    height: 3,
    backgroundColor: colors.surface,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.green,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 16,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  time: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timeExpired: {
    color: colors.green,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    padding: 6,
  },
});
