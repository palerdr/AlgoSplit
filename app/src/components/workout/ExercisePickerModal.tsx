import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EXERCISE_DATABASE } from '../../data/exercises';
import { useCustomExercises } from '../../hooks/useCustomExercises';
import { colors } from '../../theme';

interface ExercisePickerModalProps {
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

// Flatten exercise database into a single list
const ALL_EXERCISES = EXERCISE_DATABASE.flatMap((cat) =>
  cat.exercises.map((ex) => ({ name: ex.name, category: cat.name, unilateral: ex.unilateral })),
);

// De-duplicate by lowercase name (keep first occurrence)
const UNIQUE_EXERCISES = ALL_EXERCISES.filter(
  (ex, i, arr) => arr.findIndex((e) => e.name.toLowerCase() === ex.name.toLowerCase()) === i,
);

export default function ExercisePickerModal({ visible, onSelect, onClose }: ExercisePickerModalProps) {
  const [search, setSearch] = useState('');
  const { data: customData } = useCustomExercises();

  const allExercises = useMemo(() => {
    const customEntries = (customData?.exercises ?? []).map((ex) => ({
      name: ex.exercise_name,
      category: 'My Exercises',
      unilateral: !ex.is_bilateral,
    }));
    const combined = [...customEntries, ...UNIQUE_EXERCISES];
    return combined.filter(
      (ex, i, arr) => arr.findIndex((e) => e.name.toLowerCase() === ex.name.toLowerCase()) === i,
    );
  }, [customData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allExercises.slice(0, 80);
    const q = search.toLowerCase();
    return allExercises.filter((ex) => ex.name.toLowerCase().includes(q)).slice(0, 50);
  }, [search, allExercises]);

  const handleSelect = (name: string) => {
    setSearch('');
    onSelect(name);
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.exerciseRow} onPress={() => handleSelect(item.name)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{item.name}</Text>
                  <Text style={styles.exerciseCategory}>{item.category}</Text>
                </View>
                {item.unilateral && (
                  <View style={styles.uniBadge}>
                    <Text style={styles.uniBadgeText}>UNI</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No exercises found</Text>
                {search.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.addCustomBtn}
                    onPress={() => handleSelect(search.trim())}
                  >
                    <Ionicons name="add" size={16} color={colors.green} />
                    <Text style={styles.addCustomText}>Add "{search.trim()}"</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '60%',
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    padding: 0,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 15,
  },
  exerciseCategory: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  uniBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  uniBadgeText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 8,
  },
  addCustomText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '600',
  },
});
