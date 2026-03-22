import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface WorkoutActionSheetProps {
  visible: boolean;
  onAddAfter?: () => void;
  onReset: () => void;
  onSwap: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function WorkoutActionSheet({
  visible,
  onAddAfter,
  onReset,
  onSwap,
  onDelete,
  onClose,
}: WorkoutActionSheetProps) {
  if (!visible) return null;

  return (
    <>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.dropdown}>
        {onAddAfter && (
          <>
            <TouchableOpacity style={styles.item} onPress={onAddAfter}>
              <Ionicons name="add-circle-outline" size={16} color={colors.text} />
              <Text style={styles.itemText}>Add Exercise</Text>
            </TouchableOpacity>
            <View style={styles.sep} />
          </>
        )}
        <TouchableOpacity style={styles.item} onPress={onReset}>
          <Ionicons name="refresh-outline" size={16} color={colors.text} />
          <Text style={styles.itemText}>Reset Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={onSwap}>
          <Ionicons name="swap-horizontal-outline" size={16} color={colors.text} />
          <Text style={styles.itemText}>Swap Exercise</Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        <TouchableOpacity style={styles.item} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.red} />
          <Text style={[styles.itemText, { color: colors.red }]}>Delete Exercise</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  dropdown: {
    position: 'absolute',
    top: 52,
    right: 4,
    zIndex: 11,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  itemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  sep: {
    height: 0.5,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
});
