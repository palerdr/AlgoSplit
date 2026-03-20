import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useCustomExercises,
  useCreateCustomExercise,
  useUpdateCustomExercise,
  useDeleteCustomExercise,
} from '../../../src/hooks/useCustomExercises';
import { colors, borders } from '../../../src/theme';
import { InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import type { CustomExerciseResponse, CustomExerciseCreate } from '../../../src/types/api.types';

// ─── Canonical muscle regions grouped for the picker ─────────────

const MUSCLE_GROUPS: Array<{ group: string; regions: Array<{ id: string; label: string }> }> = [
  {
    group: 'Chest',
    regions: [
      { id: 'clavicular', label: 'Clavicular (Upper)' },
      { id: 'sternocostal', label: 'Sternocostal (Mid/Lower)' },
    ],
  },
  {
    group: 'Back',
    regions: [
      { id: 'thoracic_lats', label: 'Upper Lats' },
      { id: 'iliac_lats', label: 'Lower Lats' },
      { id: 'trapezius', label: 'Trapezius' },
      { id: 'rhomboids', label: 'Rhomboids' },
      { id: 'spinal_erectors', label: 'Spinal Erectors' },
    ],
  },
  {
    group: 'Shoulders',
    regions: [
      { id: 'anterior_deltoid', label: 'Front Delt' },
      { id: 'lateral_deltoid', label: 'Side Delt' },
      { id: 'posterior_deltoid', label: 'Rear Delt' },
    ],
  },
  {
    group: 'Arms',
    regions: [
      { id: 'biceps_brachii', label: 'Biceps' },
      { id: 'brachialis', label: 'Brachialis' },
      { id: 'triceps_long_head', label: 'Triceps Long Head' },
      { id: 'triceps_lateral_medial', label: 'Triceps Lat/Med' },
      { id: 'brachioradialis', label: 'Brachioradialis' },
      { id: 'wrist_flexors', label: 'Wrist Flexors' },
      { id: 'wrist_extensors', label: 'Wrist Extensors' },
    ],
  },
  {
    group: 'Core',
    regions: [
      { id: 'anterior_core', label: 'Anterior Core' },
      { id: 'lateral_core', label: 'Lateral Core' },
    ],
  },
  {
    group: 'Glutes & Hips',
    regions: [
      { id: 'glute_max', label: 'Glute Max' },
      { id: 'glute_med_min', label: 'Glute Med/Min' },
      { id: 'hip_adductors', label: 'Hip Adductors' },
    ],
  },
  {
    group: 'Legs',
    regions: [
      { id: 'rectus_femoris', label: 'Rectus Femoris' },
      { id: 'vasti', label: 'Vasti (Quads)' },
      { id: 'hip_extensors', label: 'Hip Extensors' },
      { id: 'knee_flexors', label: 'Knee Flexors' },
      { id: 'gastrocnemius', label: 'Gastrocnemius' },
      { id: 'soleus', label: 'Soleus' },
    ],
  },
];

const ALL_REGIONS = MUSCLE_GROUPS.flatMap((g) => g.regions);

const RESISTANCE_PROFILES: Array<{ key: CustomExerciseCreate['resistance_profile']; label: string }> = [
  { key: 'ascending', label: 'Ascending' },
  { key: 'mid', label: 'Mid-Range' },
  { key: 'descending', label: 'Descending' },
];

const TIERS = ['prime', 'secondary', 'tertiary'] as const;
type Tier = typeof TIERS[number];

const TIER_LABELS: Record<Tier, string> = {
  prime: 'Prime Movers',
  secondary: 'Secondary',
  tertiary: 'Tertiary',
};

interface TargetRow {
  regionId: string;
  weight: string;
}

type TierTargets = Record<Tier, TargetRow[]>;

function emptyTiers(): TierTargets {
  return { prime: [], secondary: [], tertiary: [] };
}

function tiersToPayload(tiers: TierTargets): Pick<
  CustomExerciseCreate,
  'prime_targets' | 'secondary_targets' | 'tertiary_targets' | 'quaternary_targets'
> {
  const convert = (rows: TargetRow[]): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const row of rows) {
      const w = parseFloat(row.weight);
      if (row.regionId && !isNaN(w) && w > 0) result[row.regionId] = w;
    }
    return result;
  };
  return {
    prime_targets: convert(tiers.prime),
    secondary_targets: convert(tiers.secondary),
    tertiary_targets: convert(tiers.tertiary),
    quaternary_targets: {},
  };
}

function computeWeightSum(tiers: TierTargets): number {
  let sum = 0;
  for (const tier of TIERS) {
    for (const row of tiers[tier]) {
      const w = parseFloat(row.weight);
      if (!isNaN(w)) sum += w;
    }
  }
  return Math.round(sum * 1000) / 1000;
}

function targetsToRows(targets: Record<string, number>): TargetRow[] {
  return Object.entries(targets).map(([regionId, weight]) => ({
    regionId,
    weight: String(weight),
  }));
}

interface MuscleRegionInputProps {
  regionId: string;
  takenRegionIds: Set<string>;
  onChangeRegion: (regionId: string) => void;
}

function MuscleRegionInput({ regionId, takenRegionIds, onChangeRegion }: MuscleRegionInputProps) {
  const selectingSuggestionRef = useRef(false);
  const selectedLabel = useMemo(
    () => ALL_REGIONS.find((r) => r.id === regionId)?.label ?? '',
    [regionId],
  );
  const [query, setQuery] = useState(selectedLabel);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  const suggestions = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (lower.length < 2) return [];
    return ALL_REGIONS
      .filter((r) => !takenRegionIds.has(r.id) || r.id === regionId)
      .filter((r) => r.label.toLowerCase().includes(lower) || r.id.includes(lower))
      .slice(0, 6);
  }, [query, takenRegionIds, regionId]);

  const handleSelect = useCallback(
    (region: { id: string; label: string }) => {
      selectingSuggestionRef.current = true;
      onChangeRegion(region.id);
      setQuery(region.label);
      setShowSuggestions(false);
      setTimeout(() => {
        selectingSuggestionRef.current = false;
      }, 120);
    },
    [onChangeRegion],
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (selectingSuggestionRef.current) {
        setShowSuggestions(false);
        return;
      }

      const trimmed = query.trim();
      if (!trimmed) {
        onChangeRegion('');
        setShowSuggestions(false);
        return;
      }

      const exact = ALL_REGIONS.find(
        (r) => r.label.toLowerCase() === trimmed.toLowerCase() || r.id === trimmed.toLowerCase(),
      );

      if (exact && (!takenRegionIds.has(exact.id) || exact.id === regionId)) {
        onChangeRegion(exact.id);
        setQuery(exact.label);
      } else {
        setQuery(selectedLabel);
      }

      setShowSuggestions(false);
    }, 150);
  }, [query, onChangeRegion, takenRegionIds, regionId, selectedLabel]);

  return (
    <View style={styles.regionFieldWrap}>
      <View style={styles.regionInputShell}>
        <TextInput
          style={styles.regionInput}
          placeholder="Select muscle..."
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShowSuggestions(true);
          }}
          onFocus={() => query.trim().length >= 2 && setShowSuggestions(true)}
          onBlur={handleBlur}
        />
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.regionSuggestions}>
          {suggestions.map((region) => (
            <TouchableOpacity
              key={region.id}
              style={styles.regionSuggestionItem}
              onPressIn={() => handleSelect(region)}
            >
              <Text style={styles.regionSuggestionText}>{region.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────

export default function ExercisesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading } = useCustomExercises();
  const createMutation = useCreateCustomExercise();
  const updateMutation = useUpdateCustomExercise();
  const deleteMutation = useDeleteCustomExercise();

  const [showForm, setShowForm] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tiers, setTiers] = useState<TierTargets>(emptyTiers);
  const [axialLoad, setAxialLoad] = useState('0');
  const [resistanceProfile, setResistanceProfile] = useState<CustomExerciseCreate['resistance_profile']>('mid');
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<Tier, boolean>>({
    prime: true,
    secondary: false,
    tertiary: false,
  });

  const exercises = data?.exercises ?? [];
  const weightSum = useMemo(() => computeWeightSum(tiers), [tiers]);
  const isValidSum = Math.abs(weightSum - 1.0) < 0.015;
  const selectedRegionIds = useMemo(
    () => new Set(TIERS.flatMap((tier) => tiers[tier].map((row) => row.regionId).filter(Boolean))),
    [tiers],
  );

  const resetForm = useCallback(() => {
    setEditingExerciseId(null);
    setName('');
    setTiers(emptyTiers());
    setAxialLoad('0');
    setResistanceProfile('mid');
    setIsUnilateral(false);
    setExpandedTiers({ prime: true, secondary: false, tertiary: false });
  }, []);

  const startEditExercise = useCallback((exercise: CustomExerciseResponse) => {
    setEditingExerciseId(exercise.id);
    setName(exercise.exercise_name);
    setTiers({
      prime: targetsToRows(exercise.prime_targets),
      secondary: targetsToRows(exercise.secondary_targets),
      tertiary: targetsToRows(exercise.tertiary_targets),
    });
    setAxialLoad(String(exercise.axial_load));
    setResistanceProfile(exercise.resistance_profile);
    setIsUnilateral(!exercise.is_bilateral);
    setExpandedTiers({ prime: true, secondary: true, tertiary: true });
    setShowForm(true);
  }, []);

  const handleSaveExercise = useCallback(() => {
    if (!name.trim()) { Alert.alert('Error', 'Exercise name is required.'); return; }
    if (!isValidSum) { Alert.alert('Error', `Muscle weights must sum to 1.0 (currently ${weightSum}).`); return; }

    const payload: CustomExerciseCreate = {
      exercise_name: name.trim(),
      ...tiersToPayload(tiers),
      axial_load: Math.max(0, Math.min(1, parseFloat(axialLoad) || 0)),
      resistance_profile: resistanceProfile,
      is_bilateral: !isUnilateral,
    };

    const onSuccess = () => {
      resetForm();
      setShowForm(false);
    };
    const onError = (err: unknown) => {
      const fallback = editingExerciseId ? 'Failed to update exercise.' : 'Failed to create exercise.';
      const msg = (err as Error).message ?? fallback;
      Alert.alert('Error', msg);
    };

    if (editingExerciseId) {
      updateMutation.mutate({ id: editingExerciseId, data: payload }, { onSuccess, onError });
      return;
    }

    createMutation.mutate(payload, { onSuccess, onError });
  }, [
    name,
    tiers,
    axialLoad,
    resistanceProfile,
    isUnilateral,
    weightSum,
    isValidSum,
    createMutation,
    updateMutation,
    editingExerciseId,
    resetForm,
  ]);

  const handleDelete = useCallback((ex: CustomExerciseResponse) => {
    Alert.alert('Delete Exercise', `Delete "${ex.exercise_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(ex.id) },
    ]);
  }, [deleteMutation]);

  const addTargetRow = useCallback((tier: Tier) => {
    setTiers((prev) => ({
      ...prev,
      [tier]: [...prev[tier], { regionId: '', weight: '' }],
    }));
  }, []);

  const updateTargetRow = useCallback((tier: Tier, index: number, field: 'regionId' | 'weight', value: string) => {
    setTiers((prev) => {
      const rows = [...prev[tier]];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [tier]: rows };
    });
  }, []);

  const removeTargetRow = useCallback((tier: Tier, index: number) => {
    setTiers((prev) => ({
      ...prev,
      [tier]: prev[tier].filter((_, i) => i !== index),
    }));
  }, []);

  // ── Render exercise list item ──

  const renderExercise = useCallback(({ item }: { item: CustomExerciseResponse }) => {
    const primeNames = Object.keys(item.prime_targets)
      .map((id) => ALL_REGIONS.find((r) => r.id === id)?.label ?? id)
      .join(', ');

    return (
      <View style={styles.exerciseRow}>
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{item.exercise_name}</Text>
          <Text style={styles.exerciseMeta} numberOfLines={1}>
            {primeNames || 'No targets'} · {item.resistance_profile} · {item.is_bilateral ? 'Bilateral' : 'Unilateral'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => startEditExercise(item)} hitSlop={8} style={styles.rowIconBtn}>
          <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </View>
    );
  }, [handleDelete, startEditExercise]);

  // ── Create form ──

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { resetForm(); setShowForm(false); }} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editingExerciseId ? 'Edit Exercise' : 'New Exercise'}</Text>
          <TouchableOpacity onPress={handleSaveExercise} disabled={createMutation.isPending || updateMutation.isPending}>
            <Text style={[styles.saveText, (createMutation.isPending || updateMutation.isPending) && { opacity: 0.5 }]}>
              {createMutation.isPending || updateMutation.isPending ? (editingExerciseId ? 'Updating...' : 'Saving...') : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <Text style={styles.fieldLabel}>Exercise Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Cable Crossover"
            placeholderTextColor={colors.textDim}
            value={name}
            onChangeText={setName}
          />

          {/* Muscle Targets */}
          <View style={styles.sumRow}>
            <Text style={styles.fieldLabel}>Muscle Targets</Text>
            <InfoButton title={HELP_CONTENT['exercises.muscleTargets'].title} body={HELP_CONTENT['exercises.muscleTargets'].body} />
            <Text style={[styles.sumBadge, isValidSum ? styles.sumValid : styles.sumInvalid]}>
              Sum: {weightSum.toFixed(2)} / 1.00
            </Text>
          </View>

          {TIERS.map((tier) => (
            <View key={tier} style={styles.tierBlock}>
              <TouchableOpacity
                style={styles.tierHeader}
                onPress={() =>
                  setExpandedTiers((prev) => ({
                    ...prev,
                    [tier]: !prev[tier],
                  }))
                }
              >
                <Text style={styles.tierTitle}>{TIER_LABELS[tier]}</Text>
                <View style={styles.tierRight}>
                  {tiers[tier].length > 0 && (
                    <Text style={styles.tierCount}>{tiers[tier].length}</Text>
                  )}
                  <Ionicons
                    name={expandedTiers[tier] ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {expandedTiers[tier] && (
                <View style={styles.tierBody}>
                  {tiers[tier].map((row, i) => (
                    <View key={i} style={styles.targetRow}>
                      <MuscleRegionInput
                        regionId={row.regionId}
                        takenRegionIds={selectedRegionIds}
                        onChangeRegion={(nextRegionId) => updateTargetRow(tier, i, 'regionId', nextRegionId)}
                      />
                      <TextInput
                        style={styles.weightInput}
                        keyboardType="decimal-pad"
                        placeholder="0.0"
                        placeholderTextColor={colors.textDim}
                        value={row.weight}
                        onChangeText={(v) => updateTargetRow(tier, i, 'weight', v)}
                      />
                      <TouchableOpacity onPress={() => removeTargetRow(tier, i)} hitSlop={6}>
                        <Ionicons name="close-circle" size={18} color={colors.textDim} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addTargetBtn} onPress={() => addTargetRow(tier)}>
                    <Ionicons name="add" size={14} color={colors.green} />
                    <Text style={styles.addTargetText}>Add Muscle</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          {/* Axial Load */}
          <Text style={styles.fieldLabel}>Axial Load (0-1)</Text>
          <TextInput
            style={styles.textInput}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textDim}
            value={axialLoad}
            onChangeText={setAxialLoad}
          />

          {/* Resistance Profile */}
          <View style={styles.resistanceLabelRow}>
            <Text style={styles.fieldLabel}>Resistance Profile</Text>
            <InfoButton title={HELP_CONTENT['exercises.resistanceProfile'].title} body={HELP_CONTENT['exercises.resistanceProfile'].body} />
          </View>
          <View style={styles.segmented}>
            {RESISTANCE_PROFILES.map((rp) => {
              const active = rp.key === resistanceProfile;
              return (
                <TouchableOpacity
                  key={rp.key}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setResistanceProfile(rp.key)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {rp.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Unilateral Toggle */}
          <TouchableOpacity style={styles.toggleRow} onPress={() => setIsUnilateral(!isUnilateral)}>
            <Text style={styles.fieldLabel}>Unilateral</Text>
            <View style={[styles.toggle, isUnilateral && styles.toggleActive]}>
              <View style={[styles.toggleKnob, isUnilateral && styles.toggleKnobActive]} />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Exercise list view ──

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/splits')} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Custom Exercises</Text>
          <InfoButton title={HELP_CONTENT['exercises.customOverview'].title} body={HELP_CONTENT['exercises.customOverview'].body} />
        </View>
        <TouchableOpacity onPress={() => { resetForm(); setShowForm(true); }} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={24} color={colors.green} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : exercises.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Custom Exercises</Text>
          <Text style={styles.emptySubtitle}>
            Create your own movements with custom muscle targets, resistance profiles, and more.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => { resetForm(); setShowForm(true); }}>
            <Text style={styles.createBtnText}>Create Exercise</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  saveText: { color: colors.green, fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  createBtn: {
    backgroundColor: colors.green,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  createBtnText: { color: colors.bg, fontSize: 15, fontWeight: '700' },

  // Exercise row
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  exerciseInfo: { flex: 1, marginRight: 12 },
  exerciseName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  exerciseMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowIconBtn: { marginRight: 10 },

  // Form
  formContent: { paddingHorizontal: 16, paddingBottom: 60, gap: 12 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },

  // Weight sum badge
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  resistanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sumBadge: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  sumValid: { backgroundColor: 'rgba(74, 222, 128, 0.15)', color: colors.green },
  sumInvalid: { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: colors.red },

  // Tier
  tierBlock: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tierTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  tierRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierCount: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tierBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },

  // Target row
  targetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  regionFieldWrap: {
    flex: 1,
  },
  regionInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  regionInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  regionSuggestions: {
    marginTop: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  regionSuggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  regionSuggestionText: {
    color: colors.text,
    fontSize: 13,
  },
  weightInput: {
    width: 60,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  addTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  addTargetText: { color: colors.green, fontSize: 13, fontWeight: '600' },

  // Segmented control
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.green },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: colors.bg, fontWeight: '700' },

  // Toggle
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 0.5,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: { backgroundColor: colors.green, borderColor: colors.green },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
  },
  toggleKnobActive: { backgroundColor: '#fff', alignSelf: 'flex-end' },
});
