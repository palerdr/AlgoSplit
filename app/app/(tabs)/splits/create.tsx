import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../../src/components/ui';
import SessionEditorMobile from '../../../src/components/splits/SessionEditorMobile';
import { useCreateSplit } from '../../../src/hooks/useSplits';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { getErrorMessage } from '../../../src/api/client';
import { generateExerciseId } from '../../../src/utils/splitEditHelpers';
import { colors, typography, spacing, borders } from '../../../src/theme';
import type { SessionInput } from '../../../src/types/api.types';

function makeDefaultSession(): SessionInput {
  return { name: '', day: 1, exercises: [{ id: generateExerciseId(), name: '', sets: 3 }] };
}

export default function CreateSplitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createMutation = useCreateSplit();
  const defaultDataset = useSettingsStore((s) => s.dataset);
  const defaultStimulusDuration = useSettingsStore((s) => s.stimulusDuration);
  const defaultMaintenanceVolume = useSettingsStore((s) => s.maintenanceVolume);

  const [splitName, setSplitName] = useState('');
  const [sessions, setSessions] = useState<SessionInput[]>([makeDefaultSession()]);
  const [dataset, setDataset] = useState<'schoenfeld' | 'pelland' | 'average'>(defaultDataset);
  const [cycleLength, setCycleLength] = useState('');
  const [stimulusDuration, setStimulusDuration] = useState(String(defaultStimulusDuration));
  const [maintenanceVolume, setMaintenanceVolume] = useState(String(defaultMaintenanceVolume));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [isDraggingExercises, setIsDraggingExercises] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = useCallback(() => {
    setIsDraggingExercises(true);
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    dragResetTimerRef.current = setTimeout(() => {
      setIsDraggingExercises(false);
      dragResetTimerRef.current = null;
    }, 2500);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragResetTimerRef.current) {
      clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = null;
    }
    setIsDraggingExercises(false);
  }, []);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    };
  }, []);

  const updateSession = (index: number, session: SessionInput) => {
    const updated = [...sessions];
    updated[index] = session;
    setSessions(updated);
  };

  const removeSession = (index: number) => {
    setSessions(sessions.filter((_, i) => i !== index));
  };

  const addSession = () => {
    const nextDay = sessions.length > 0 ? Math.max(...sessions.map((s) => s.day)) + 1 : 1;
    setSessions([...sessions, { name: '', day: nextDay, exercises: [{ id: generateExerciseId(), name: '', sets: 3 }] }]);
  };

  const handleSave = async () => {
    const showSaveError = (message: string) => {
      setError(message);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      Alert.alert('Unable to save split', message);
    };

    if (!splitName.trim()) {
      showSaveError('Split name is required');
      return;
    }
    const hasValidSession = sessions.some(
      (s) => s.name.trim() && s.exercises.some((e) => e.name.trim()),
    );
    if (!hasValidSession) {
      showSaveError('Add at least one session with a named exercise');
      return;
    }

    setError('');
    try {
      const parsedCycleLength = parseInt(cycleLength, 10);
      const result = await createMutation.mutateAsync({
        name: splitName.trim(),
        sessions: sessions
          .filter((s) => s.name.trim())
          .map((s) => ({
            ...s,
            name: s.name.trim(),
            exercises: s.exercises.filter((e) => e.name.trim()),
          })),
        dataset,
        cycle_length: Number.isFinite(parsedCycleLength) ? parsedCycleLength : undefined,
        stimulus_duration: parseInt(stimulusDuration, 10) || 48,
        maintenance_volume: parseInt(maintenanceVolume, 10) || 3,
      });
      router.replace(`/(tabs)/splits/${result.id}`);
    } catch (err) {
      showSaveError(getErrorMessage(err));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/splits')} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Split</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDraggingExercises}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Input
          label="Split Name"
          placeholder="e.g. Push/Pull/Legs"
          value={splitName}
          onChangeText={setSplitName}
          containerStyle={styles.nameInput}
        />

        {sessions.map((session, i) => (
          <SessionEditorMobile
            key={i}
            session={session}
            onUpdate={(s) => updateSession(i, s)}
            onRemove={() => removeSession(i)}
            canRemove={sessions.length > 1}
            simultaneousHandlers={scrollRef}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}

        <TouchableOpacity style={styles.addSessionBtn} onPress={addSession}>
          <Ionicons name="add-circle-outline" size={20} color={colors.green} />
          <Text style={styles.addSessionText}>Add Session</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.advancedToggleText}>Advanced Settings</Text>
          <Ionicons
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.advancedSection}>
            <View style={styles.datasetRow}>
              <Text style={styles.advLabel}>Dataset</Text>
              <View style={styles.datasetPills}>
                {(['schoenfeld', 'pelland', 'average'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.pill, dataset === d && styles.pillActive]}
                    onPress={() => setDataset(d)}
                  >
                    <Text style={[styles.pillText, dataset === d && styles.pillTextActive]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Input
              label="Cycle Length (days)"
              value={cycleLength}
              onChangeText={setCycleLength}
              keyboardType="numeric"
              containerStyle={styles.advInput}
              placeholder="Auto from last session day"
            />
            <Input
              label="Stimulus Duration (hours)"
              value={stimulusDuration}
              onChangeText={setStimulusDuration}
              keyboardType="numeric"
              containerStyle={styles.advInput}
            />
            <Input
              label="Maintenance Volume (sets)"
              value={maintenanceVolume}
              onChangeText={setMaintenanceVolume}
              keyboardType="numeric"
              containerStyle={styles.advInput}
            />
          </View>
        )}

        <Button
          title="Save Split"
          onPress={handleSave}
          loading={createMutation.isPending}
          style={styles.saveBtn}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  nameInput: {
    marginBottom: 20,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  addSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    borderRadius: borders.radius.xl,
  },
  addSessionText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '600',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    marginTop: 8,
  },
  advancedToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  advancedSection: {
    marginBottom: 8,
  },
  datasetRow: {
    marginBottom: 16,
  },
  advLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  datasetPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borders.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.greenMuted,
    borderColor: colors.green,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.green,
  },
  advInput: {
    marginBottom: 12,
  },
  saveBtn: {
    marginTop: 20,
  },
});
