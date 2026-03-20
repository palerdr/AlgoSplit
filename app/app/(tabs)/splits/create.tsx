import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, InfoButton, Input } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import SessionEditorMobile from '../../../src/components/splits/SessionEditorMobile';
import { useCreateSplit } from '../../../src/hooks/useSplits';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { getErrorMessage } from '../../../src/api/client';
import {
  generateExerciseId,
  generateSessionId,
  normalizeSessionsForSave,
  parseCycleLengthInput,
} from '../../../src/utils/splitEditHelpers';
import { colors, typography, spacing, borders } from '../../../src/theme';
import type { SessionInput } from '../../../src/types/api.types';

function makeDefaultSession(): SessionInput {
  return {
    id: generateSessionId(),
    name: '',
    day: 1,
    exercises: [{ id: generateExerciseId(), name: '', sets: 3 }],
  };
}

function nextAvailableDay(sessions: SessionInput[]): number | null {
  const usedDays = new Set(sessions.map((session) => session.day));
  for (let day = 1; day <= 7; day += 1) {
    if (!usedDays.has(day)) return day;
  }
  return null;
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
  const [isDraggingSessions, setIsDraggingSessions] = useState(false);
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

  const handleSessionDragStart = useCallback(() => {
    setIsDraggingSessions(true);
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setIsDraggingSessions(false);
  }, []);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    };
  }, []);

  const updateSession = (sessionId: string | undefined, fallbackIndex: number, session: SessionInput) => {
    const updated = [...sessions];
    const index = sessionId
      ? updated.findIndex((item) => item.id === sessionId)
      : fallbackIndex;
    if (index < 0 || index >= updated.length) return;
    updated[index] = { ...session, id: updated[index].id };
    setSessions(updated);
  };

  const removeSession = (sessionId: string | undefined, fallbackIndex: number) => {
    if (sessionId) {
      setSessions(sessions.filter((item) => item.id !== sessionId));
      return;
    }
    setSessions(sessions.filter((_, i) => i !== fallbackIndex));
  };

  const addSession = () => {
    const day = nextAvailableDay(sessions);
    if (day == null) {
      Alert.alert('Maximum reached', 'Splits are capped at 7 days.');
      return;
    }
    setSessions([
      ...sessions,
      {
        id: generateSessionId(),
        name: '',
        day,
        exercises: [{ id: generateExerciseId(), name: '', sets: 3 }],
      },
    ]);
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
    const namedSessions = sessions.filter((session) => session.name.trim());
    const dayOutOfRange = namedSessions.find((session) => session.day < 1 || session.day > 7);
    if (dayOutOfRange) {
      showSaveError('Session days must be between 1 and 7.');
      return;
    }
    const emptyNamedSession = namedSessions.find(
      (session) => !session.exercises.some((exercise) => exercise.name.trim()),
    );
    if (emptyNamedSession) {
      showSaveError(
        `"${emptyNamedSession.name}" has no exercises. Rest days are implicit, so leave them out. Auto cycle length ends on your last training day, and a longer cycle length extends the split with trailing rest days.`,
      );
      return;
    }
    const hasValidSession = namedSessions.length > 0;
    if (!hasValidSession) {
      showSaveError('Add at least one session with a named exercise');
      return;
    }

    setError('');
    try {
      const parsedCycleLength = parseCycleLengthInput(cycleLength);
      if (cycleLength.trim() && parsedCycleLength == null) {
        showSaveError('Cycle length must be between 1 and 7 days.');
        return;
      }
      if (parsedCycleLength != null && namedSessions.length > parsedCycleLength) {
        showSaveError('Cycle length cannot be shorter than the number of training days in the split.');
        return;
      }
      const normalizedSessions = normalizeSessionsForSave(namedSessions, parsedCycleLength);
      const result = await createMutation.mutateAsync({
        name: splitName.trim(),
        sessions: normalizedSessions,
        dataset,
        cycle_length: parsedCycleLength,
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
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Create Split</Text>
          <InfoButton title={HELP_CONTENT['splits.overview'].title} body={HELP_CONTENT['splits.overview'].body} />
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDraggingExercises && !isDraggingSessions}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Input
          label="Split Name"
          placeholder="e.g. Push/Pull/Legs"
          value={splitName}
          onChangeText={setSplitName}
          containerStyle={styles.nameInput}
        />

        <Text style={styles.restHint}>
          Missing days are rest days. Auto cycle length ends on your last training day; a longer cycle length adds trailing rest days. Use the three-bar handle to reorder sessions.
        </Text>

        <DraggableFlatList
          data={sessions}
          keyExtractor={(item: SessionInput, index: number) => item.id ?? `session_${index}`}
          renderItem={({
            item,
            drag,
            isActive,
            getIndex,
          }: {
            item: SessionInput;
            drag: () => void;
            isActive: boolean;
            getIndex: () => number | undefined;
          }) => {
            const index = getIndex() ?? 0;
            return (
              <SessionEditorMobile
                session={item}
                onUpdate={(sessionUpdate) => updateSession(item.id, index, sessionUpdate)}
                onRemove={() => removeSession(item.id, index)}
                canRemove={sessions.length > 1}
                simultaneousHandlers={scrollRef}
                dragSession={drag}
                isSessionActive={isActive}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            );
          }}
          onDragBegin={handleSessionDragStart}
          onRelease={handleSessionDragEnd}
          onDragEnd={({ data }: { data: SessionInput[] }) => {
            const daySlots = [...sessions]
              .map((session) => session.day)
              .sort((a, b) => a - b);
            const reordered = data.map((session, index) => ({
              ...session,
              day: daySlots[index] ?? Math.min(index + 1, 7),
            }));
            setSessions(reordered);
            handleSessionDragEnd();
          }}
          scrollEnabled={false}
          activationDistance={14}
          autoscrollThreshold={40}
          autoscrollSpeed={150}
          dragHitSlop={{ left: 0, top: 0, bottom: 0, right: -1000 }}
          keyboardShouldPersistTaps="handled"
          simultaneousHandlers={scrollRef}
        />

        <TouchableOpacity style={styles.addSessionBtn} onPress={addSession}>
          <Ionicons name="add-circle-outline" size={20} color={colors.green} />
          <Text style={styles.addSessionText}>Add Session</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.advancedToggleText}>Advanced Settings</Text>
          <InfoButton title={HELP_CONTENT['splits.detailedAnalysis'].title} body={HELP_CONTENT['splits.detailedAnalysis'].body} />
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  restHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
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
