import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface WorkoutHeaderMobileProps {
  sessionName: string;
  startedAt: string;
  onAddExercise: () => void;
  onMinimize: () => void;
  onCancel: () => void;
}

export default function WorkoutHeaderMobile({
  sessionName,
  startedAt,
  onAddExercise,
  onMinimize,
  onCancel,
}: WorkoutHeaderMobileProps) {
  const [elapsed, setElapsed] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMinimize} hitSlop={8}>
        <Ionicons name="chevron-down" size={28} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>{sessionName}</Text>
        <Text style={styles.timer}>{m}:{String(s).padStart(2, '0')}</Text>
      </View>

      <View style={styles.right}>
        <TouchableOpacity onPress={onAddExercise} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={24} color={colors.text} />
        </TouchableOpacity>
        {confirming ? (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Sure?</Text>
            <TouchableOpacity onPress={() => setConfirming(false)} hitSlop={8}>
              <Text style={styles.confirmNo}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} hitSlop={8}>
              <Text style={styles.confirmYes}>Yes</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setConfirming(true)} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  timer: {
    color: colors.textSecondary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  confirmNo: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmYes: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '700',
  },
});
