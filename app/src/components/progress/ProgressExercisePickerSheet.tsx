import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export interface ExercisePickerItem {
  name: string;
  source?: string;
}

interface Props {
  visible: boolean;
  exercises: ExercisePickerItem[];
  onSelect: (name: string) => void;
  onClose: () => void;
}

export default function ProgressExercisePickerSheet({
  visible,
  exercises,
  onSelect,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return exercises;
    const q = search.toLowerCase();
    return exercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [exercises, search]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setSearch('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Select Exercise</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises..."
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => handleSelect(item.name)}>
              <Text style={styles.exerciseName}>{item.name}</Text>
              {item.source ? (
                <Text style={styles.exerciseSource}>{item.source}</Text>
              ) : null}
            </TouchableOpacity>
          )}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No exercises found</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  exerciseSource: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  emptyRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
