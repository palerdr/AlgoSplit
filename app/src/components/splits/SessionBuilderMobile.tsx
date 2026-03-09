import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borders, spacing } from '../../theme';
import { EXERCISE_DATABASE } from '../../data/exercises';
import type { SessionInput, ExerciseInput } from '../../types/api.types';

// Flat list of all exercise names for autocomplete
const ALL_EXERCISE_NAMES = EXERCISE_DATABASE.flatMap((cat) =>
  cat.exercises.map((e) => e.name),
);
// Deduplicate
const UNIQUE_NAMES = [...new Set(ALL_EXERCISE_NAMES)];

interface SessionBuilderMobileProps {
  session: SessionInput;
  onUpdate: (session: SessionInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ExerciseRow({
  exercise,
  onUpdate,
  onRemove,
}: {
  exercise: ExerciseInput;
  onUpdate: (ex: ExerciseInput) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(exercise.name);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return [];
    const lower = query.toLowerCase();
    return UNIQUE_NAMES.filter((n) => n.toLowerCase().includes(lower)).slice(0, 5);
  }, [query]);

  const handleSelect = useCallback((name: string) => {
    setQuery(name);
    setShowSuggestions(false);
    onUpdate({ ...exercise, name });
  }, [exercise, onUpdate]);

  const handleBlur = useCallback(() => {
    // Small delay to allow tap on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
    if (query !== exercise.name) {
      onUpdate({ ...exercise, name: query });
    }
  }, [query, exercise, onUpdate]);

  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseNameWrap}>
        <TextInput
          style={styles.exerciseNameInput}
          placeholder="Exercise name"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShowSuggestions(true);
          }}
          onFocus={() => query.length >= 2 && setShowSuggestions(true)}
          onBlur={handleBlur}
        />
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsDropdown}>
            {suggestions.map((name) => (
              <TouchableOpacity
                key={name}
                style={styles.suggestionItem}
                onPress={() => handleSelect(name)}
              >
                <Text style={styles.suggestionText}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={styles.setsStepper}>
        <TouchableOpacity
          onPress={() => onUpdate({ ...exercise, sets: Math.max(1, exercise.sets - 1) })}
          hitSlop={8}
        >
          <Ionicons name="remove-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.setsValue}>{exercise.sets}</Text>
        <TouchableOpacity
          onPress={() => onUpdate({ ...exercise, sets: exercise.sets + 1 })}
          hitSlop={8}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.green} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color={colors.red} />
      </TouchableOpacity>
    </View>
  );
}

export default function SessionBuilderMobile({
  session,
  onUpdate,
  onRemove,
  canRemove,
}: SessionBuilderMobileProps) {
  const updateExercise = (index: number, ex: ExerciseInput) => {
    const exercises = [...session.exercises];
    exercises[index] = ex;
    onUpdate({ ...session, exercises });
  };

  const removeExercise = (index: number) => {
    const exercises = session.exercises.filter((_, i) => i !== index);
    onUpdate({ ...session, exercises });
  };

  const addExercise = () => {
    onUpdate({
      ...session,
      exercises: [...session.exercises, { name: '', sets: 3 }],
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.sessionNameInput}
          placeholder="Session name (e.g. Push)"
          placeholderTextColor={colors.textMuted}
          value={session.name}
          onChangeText={(name) => onUpdate({ ...session, name })}
        />
        <View style={styles.dayPicker}>
          <Text style={styles.dayLabel}>Day</Text>
          <TouchableOpacity
            onPress={() => onUpdate({ ...session, day: Math.max(1, session.day - 1) })}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dayValue}>{session.day}</Text>
          <TouchableOpacity
            onPress={() => onUpdate({ ...session, day: session.day + 1 })}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.red} />
          </TouchableOpacity>
        )}
      </View>

      {session.exercises.map((ex, i) => (
        <ExerciseRow
          key={i}
          exercise={ex}
          onUpdate={(updated) => updateExercise(i, updated)}
          onRemove={() => removeExercise(i)}
        />
      ))}

      <TouchableOpacity style={styles.addExerciseBtn} onPress={addExercise}>
        <Ionicons name="add" size={18} color={colors.green} />
        <Text style={styles.addExerciseText}>Add Exercise</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sessionNameInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 4,
  },
  dayPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  dayValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  exerciseNameWrap: {
    flex: 1,
    position: 'relative',
  },
  exerciseNameInput: {
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    zIndex: 100,
    elevation: 10,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    color: colors.text,
    fontSize: 13,
  },
  setsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setsValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addExerciseText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '600',
  },
});
