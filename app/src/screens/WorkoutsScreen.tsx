import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { TemplateExercise, WorkoutTemplate } from '../data/templates';
import { EXERCISES, getExercise } from '../data/exercises';
import { useAppState } from '../state/AppState';
import { theme } from '../theme';
import Glass from '../ui/Glass';
import FadeIn from '../ui/FadeIn';

interface WorkoutsScreenProps {
  onBack: () => void;
  /** One-shot: open directly in the New Workout builder */
  startInBuilder?: boolean;
  onBuilderHandled?: () => void;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

export default function WorkoutsScreen({
  onBack,
  startInBuilder,
  onBuilderHandled,
}: WorkoutsScreenProps) {
  const { templates, addTemplate, updateTemplate } = useAppState();
  const [building, setBuilding] = useState(startInBuilder === true);
  useEffect(() => {
    if (startInBuilder) onBuilderHandled?.();
    // consume the one-shot on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<TemplateExercise[]>([]);

  // List ↔ builder handoff fades through a sibling overlay (glass-safe),
  // same pattern as the app-level screen transitions.
  const fade = useRef(new Animated.Value(1)).current;
  const switchMode = (apply: () => void) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) apply();
    });
  };
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [building, fade]);

  const resetBuilder = () => {
    setBuilding(false);
    setEditingId(null);
    setName('');
    setItems([]);
  };

  const openEditor = (template: WorkoutTemplate) => {
    switchMode(() => {
      setEditingId(template.id);
      setName(template.name);
      setItems(template.exercises.map((te) => ({ ...te })));
      setBuilding(true);
    });
  };

  const fadeOverlay = (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: theme.bg,
          opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        },
      ]}
    />
  );

  const save = () => {
    if (!name.trim() || items.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const trimmed = name.trim();
    const saved = [...items];
    const id = editingId;
    switchMode(() => {
      if (id) {
        updateTemplate(id, trimmed, saved);
      } else {
        addTemplate(trimmed, saved);
      }
      resetBuilder();
    });
  };

  const bumpSets = (index: number, delta: number) => {
    tick();
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, sets: Math.max(1, Math.min(10, it.sets + delta)) } : it
      )
    );
  };

  // ── Builder mode (new workout, or an existing one pre-filled) ───
  if (building) {
    const canSave = name.trim().length > 0 && items.length > 0;
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => switchMode(resetBuilder)} hitSlop={12}>
            <Text style={styles.back}>Cancel</Text>
          </Pressable>
          <Pressable onPress={save} disabled={!canSave}>
            <Glass style={styles.saveBtn} interactive>
              <Text style={[styles.saveText, !canSave && { opacity: 0.35 }]}>Save</Text>
            </Glass>
          </Pressable>
        </View>
        <Text style={styles.title}>{editingId ? 'Edit Workout' : 'New Workout'}</Text>

        <FlatList
          data={EXERCISES}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Glass style={styles.nameField}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Workout name"
                  placeholderTextColor={theme.textDim}
                  style={styles.nameInput}
                />
              </Glass>

              {items.map((it, i) => (
                <View key={`${it.exerciseId}-${i}`} style={styles.pickedRow}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    {getExercise(it.exerciseId)?.name ?? it.exerciseId}
                  </Text>
                  <View style={styles.setsControl}>
                    <Pressable onPress={() => bumpSets(i, -1)} hitSlop={8} style={styles.setsBtn}>
                      <Text style={styles.setsBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.setsValue}>{it.sets}×</Text>
                    <Pressable onPress={() => bumpSets(i, 1)} hitSlop={8} style={styles.setsBtn}>
                      <Text style={styles.setsBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => {
                      tick();
                      setItems((prev) => prev.filter((_, j) => j !== i));
                    }}
                    hitSlop={10}
                  >
                    <Text style={styles.removeX}>✕</Text>
                  </Pressable>
                </View>
              ))}

              <Text style={styles.sectionLabel}>
                {items.length === 0 ? 'Tap exercises to add them, in order' : 'Add more'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.catalogRow}
              onPress={() => {
                tick();
                setItems((prev) => [...prev, { exerciseId: item.id, sets: 3 }]);
              }}
            >
              <Text style={styles.catalogName}>{item.name}</Text>
              <Text style={styles.catalogPlus}>+</Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
        {fadeOverlay}
      </View>
    );
  }

  // ── List mode: New workout on top, then name-only rows ──────────
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backWrap}>
        <Glass style={styles.backChip} interactive>
          <Text style={styles.backText}>‹ Home</Text>
        </Glass>
      </Pressable>
      <Text style={styles.title}>Workouts</Text>

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <FadeIn>
            <Pressable
              onPress={() => {
                tick();
                switchMode(() => setBuilding(true));
              }}
            >
              <Glass style={styles.newBtn} interactive>
                <Text style={styles.newBtnText}>+ New workout</Text>
              </Glass>
            </Pressable>
          </FadeIn>
        }
        renderItem={({ item, index }) => (
          <FadeIn delay={(index + 1) * 45}>
            <Pressable
              onPress={() => {
                tick();
                openEditor(item);
              }}
            >
              <Glass style={styles.nameRow} interactive>
                <Text style={styles.nameRowText}>{item.name}</Text>
                <Text style={styles.chevron}>›</Text>
              </Glass>
            </Pressable>
          </FadeIn>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      {fadeOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  back: {
    color: theme.textDim,
    fontSize: 15,
    marginBottom: 16,
  },
  backWrap: {
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  backChip: {
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  newBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  newBtnText: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  nameRow: {
    borderRadius: 18,
    paddingVertical: 17,
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRowText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: theme.textDim,
    fontSize: 20,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  exerciseLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  exerciseLineBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.09)',
  },
  exerciseName: {
    color: theme.text,
    fontSize: 15,
  },
  sets: {
    color: theme.textDim,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    borderRadius: 17,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  saveText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  nameField: {
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  nameInput: {
    color: theme.text,
    fontSize: 17,
    paddingVertical: 14,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  pickedName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  setsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setsBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setsBtnText: {
    color: theme.text,
    fontSize: 17,
    lineHeight: 19,
  },
  setsValue: {
    color: theme.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 26,
    textAlign: 'center',
  },
  removeX: {
    color: theme.textDim,
    fontSize: 15,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 8,
  },
  catalogRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catalogName: {
    color: theme.text,
    fontSize: 16,
  },
  catalogPlus: {
    color: theme.accent,
    fontSize: 20,
    fontWeight: '600',
  },
});
