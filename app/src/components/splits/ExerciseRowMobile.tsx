import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borders, spacing } from '../../theme';
import { EXERCISE_DATABASE, findExercise } from '../../data/exercises';
import { useCustomExercises } from '../../hooks/useCustomExercises';
import type { ExerciseInput } from '../../types/api.types';

const STATIC_EXERCISE_NAMES = [
  ...new Set(EXERCISE_DATABASE.flatMap((cat) => cat.exercises.map((e) => e.name))),
];

const RESISTANCE_PROFILES = [
  { key: null, label: 'Auto' },
  { key: 'ascending', label: 'Asc' },
  { key: 'mid', label: 'Mid' },
  { key: 'descending', label: 'Desc' },
] as const;

interface Props {
  exercise: ExerciseInput;
  index: number;
  onUpdate: (ex: ExerciseInput) => void;
  onRemove: () => void;
  drag?: () => void;
  isActive?: boolean;
}

export default function ExerciseRowMobile({
  exercise,
  index: _index,
  onUpdate,
  onRemove,
  drag,
  isActive = false,
}: Props) {
  const { data: customData } = useCustomExercises();
  const [query, setQuery] = useState(exercise.name);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allExerciseNames = useMemo(() => {
    const customNames = customData?.exercises.map((e) => e.exercise_name) ?? [];
    return [...new Set([...customNames, ...STATIC_EXERCISE_NAMES])];
  }, [customData]);

  useEffect(() => {
    setQuery(exercise.name);
  }, [exercise.name]);

  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return [];
    const lower = query.toLowerCase();
    return allExerciseNames.filter((n) => n.toLowerCase().includes(lower)).slice(0, 5);
  }, [query, allExerciseNames]);

  const handleSelect = useCallback(
    (name: string) => {
      setQuery(name);
      setShowSuggestions(false);
      const found = findExercise(name);
      const uni = found?.unilateral ?? exercise.unilateral;
      onUpdate({ ...exercise, name, unilateral: uni || undefined });
    },
    [exercise, onUpdate],
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);

    if (query !== exercise.name) {
      const found = findExercise(query);
      const uni = found?.unilateral ?? exercise.unilateral;
      onUpdate({ ...exercise, name: query, unilateral: uni || undefined });
    }
  }, [query, exercise, onUpdate]);

  const toggleUnilateral = () => {
    onUpdate({ ...exercise, unilateral: !exercise.unilateral });
  };

  const currentProfile = exercise.resistance_profile ?? null;

  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      {/* Row 1: Drag handle + Name + Remove */}
      <View style={styles.row1}>
        <TouchableOpacity
          style={styles.dragHandle}
          onLongPress={drag}
          delayLongPress={120}
          hitSlop={8}
        >
          <Ionicons name="reorder-three-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.nameWrap}>
          <TextInput
            style={styles.nameInput}
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
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Inline suggestions (expands card, no z-index issues) */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsInline}>
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

      {/* Row 2: UNI toggle + Resistance pills + Sets stepper */}
      <View style={styles.row2}>
        <TouchableOpacity
          style={[styles.uniPill, exercise.unilateral && styles.uniPillActive]}
          onPress={toggleUnilateral}
        >
          <Text style={[styles.uniPillText, exercise.unilateral && styles.uniPillTextActive]}>
            UNI
          </Text>
        </TouchableOpacity>

        <View style={styles.resistancePills}>
          {RESISTANCE_PROFILES.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.resPill, currentProfile === p.key && styles.resPillActive]}
              onPress={() =>
                onUpdate({
                  ...exercise,
                  resistance_profile: p.key as ExerciseInput['resistance_profile'],
                })
              }
            >
              <Text
                style={[styles.resPillText, currentProfile === p.key && styles.resPillTextActive]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.setsStepper}>
          <TouchableOpacity
            onPress={() => onUpdate({ ...exercise, sets: Math.max(1, exercise.sets - 1) })}
            hitSlop={6}
          >
            <Ionicons name="remove-circle-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.setsValue}>{exercise.sets}</Text>
          <TouchableOpacity
            onPress={() => onUpdate({ ...exercise, sets: exercise.sets + 1 })}
            hitSlop={6}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.green} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.md,
    padding: spacing.sm,
  },
  containerActive: {
    borderWidth: 1,
    borderColor: colors.green,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dragHandle: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  nameWrap: {
    flex: 1,
  },
  nameInput: {
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  suggestionsInline: {
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  uniPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borders.radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  uniPillActive: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: colors.green,
  },
  uniPillText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  uniPillTextActive: {
    color: colors.green,
  },
  resistancePills: {
    flexDirection: 'row',
    gap: 3,
  },
  resPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: borders.radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  resPillActive: {
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    borderColor: colors.blue,
  },
  resPillText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  resPillTextActive: {
    color: colors.blue,
  },
  setsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
  },
  setsValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'center',
  },
});
