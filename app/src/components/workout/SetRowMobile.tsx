import { memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SetData } from '../../stores/workoutStore';
import { colors } from '../../theme';

interface SetRowMobileProps {
  setIndex: number;
  data: SetData;
  previousSet?: { reps: number; weight: number; rir?: number | null };
  sideLabel?: 'L' | 'R';
  onUpdate: (data: Partial<SetData>) => void;
  onComplete: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SetRowMobile({
  setIndex,
  data,
  previousSet,
  sideLabel,
  onUpdate,
  onComplete,
  onRemove,
  canRemove,
}: SetRowMobileProps) {
  const label = sideLabel
    ? `${setIndex + 1}${sideLabel}`
    : `${setIndex + 1}`;

  return (
    <View style={[styles.row, data.completed && styles.rowCompleted]}>
      <Text style={[styles.setLabel, data.completed && styles.setLabelCompleted]}>{label}</Text>

      <View style={styles.inputCell}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={data.weight ? String(data.weight) : ''}
          placeholder={previousSet?.weight ? String(previousSet.weight) : '0'}
          placeholderTextColor={colors.textDim}
          onChangeText={(t) => {
            const v = parseFloat(t);
            onUpdate({ weight: isNaN(v) ? 0 : v });
          }}
          selectTextOnFocus
        />
      </View>

      <View style={styles.inputCell}>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={data.reps ? String(data.reps) : ''}
          placeholder={previousSet?.reps ? String(previousSet.reps) : '0'}
          placeholderTextColor={colors.textDim}
          onChangeText={(t) => {
            const v = parseInt(t, 10);
            onUpdate({ reps: isNaN(v) ? 0 : v });
          }}
          selectTextOnFocus
        />
      </View>

      <View style={styles.rirCell}>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={data.rir != null ? String(data.rir) : ''}
          placeholder={previousSet?.rir != null ? String(previousSet.rir) : '—'}
          placeholderTextColor={colors.textDim}
          onChangeText={(t) => {
            const v = parseInt(t, 10);
            if (t === '') onUpdate({ rir: undefined });
            else if (!isNaN(v) && v >= 0 && v <= 5) onUpdate({ rir: v });
          }}
          selectTextOnFocus
        />
      </View>

      <TouchableOpacity
        style={[styles.checkBtn, data.completed && styles.checkBtnActive]}
        onPress={onComplete}
        disabled={!data.completed && data.reps === 0}
        hitSlop={4}
      >
        <Ionicons name="checkmark" size={18} color={data.completed ? '#111' : colors.textMuted} />
      </TouchableOpacity>

      {canRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={6} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.removePlaceholder} />
      )}
    </View>
  );
}

export default memo(SetRowMobile);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 4,
  },
  rowCompleted: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
  },
  setLabel: {
    width: 28,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  setLabelCompleted: {
    color: colors.green,
  },
  inputCell: {
    flex: 1,
  },
  rirCell: {
    flex: 0.6,
  },
  input: {
    height: 38,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnActive: {
    backgroundColor: colors.green,
  },
  removeBtn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePlaceholder: {
    width: 28,
  },
});
