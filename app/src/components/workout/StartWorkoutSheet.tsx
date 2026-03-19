import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSplitsList } from '../../hooks/useSplits';
import { colors } from '../../theme';
import type { SplitResponse, SessionResponse } from '../../types/api.types';

interface StartWorkoutSheetProps {
  visible: boolean;
  onClose: () => void;
  onStartQuick: () => void;
  onStartSession: (
    sessionName: string,
    exercises: Array<{ name: string; sets: number; unilateral: boolean; templateExerciseId?: string }>,
    sessionId?: string,
    splitId?: string,
  ) => void;
}

type Step = 'choose' | 'splits' | 'sessions';

export default function StartWorkoutSheet({
  visible,
  onClose,
  onStartQuick,
  onStartSession,
}: StartWorkoutSheetProps) {
  const [step, setStep] = useState<Step>('choose');
  const [selectedSplitId, setSelectedSplitId] = useState<string | undefined>();

  const { data: splitsData, isLoading: splitsLoading } = useSplitsList();
  const selectedSplit = useMemo(
    () => splitsData?.splits.find((split) => split.id === selectedSplitId),
    [selectedSplitId, splitsData],
  );

  const handleClose = () => {
    setStep('choose');
    setSelectedSplitId(undefined);
    onClose();
  };

  const handleBack = () => {
    if (step === 'sessions') {
      setSelectedSplitId(undefined);
      setStep('splits');
    } else if (step === 'splits') {
      setStep('choose');
    }
  };

  const handlePickSplit = (split: SplitResponse) => {
    setSelectedSplitId(split.id);
    setStep('sessions');
  };

  const handlePickSession = (session: SessionResponse) => {
    const exercises = session.exercises
      .sort((a, b) => a.order_index - b.order_index)
      .map((ex) => ({
        name: ex.exercise_name,
        sets: ex.sets,
        unilateral: ex.unilateral,
        templateExerciseId: ex.id,
      }));
    onStartSession(session.name, exercises, session.id, session.split_id);
    handleClose();
  };

  const renderChoose = () => (
    <View style={styles.chooseContainer}>
      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => { onStartQuick(); handleClose(); }}
      >
        <Ionicons name="flash-outline" size={28} color={colors.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Quick Workout</Text>
          <Text style={styles.optionDesc}>Start empty, add exercises as you go</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => setStep('splits')}
      >
        <Ionicons name="calendar-outline" size={28} color={colors.blue} />
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Start From Split</Text>
          <Text style={styles.optionDesc}>Pick a session from your splits</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );

  const renderSplits = () => {
    if (splitsLoading) {
      return <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />;
    }
    const splits = splitsData?.splits ?? [];
    if (splits.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No splits yet</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={splits}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.listRow} onPress={() => handlePickSplit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>{item.name}</Text>
              <Text style={styles.listRowSub}>
                {item.sessions.length} session{item.sessions.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    );
  };

  const renderSessions = () => {
    if (!selectedSplit) {
      return <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />;
    }
    const sessions = selectedSplit.sessions.filter((s) => s.exercises.length > 0);
    if (sessions.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No sessions with exercises</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.listRow} onPress={() => handlePickSession(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>{item.name}</Text>
              <Text style={styles.listRowSub}>
                {item.exercises.length} exercise{item.exercises.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    );
  };

  const title = step === 'choose'
    ? 'Start Workout'
    : step === 'splits'
      ? 'Select Split'
      : selectedSplit?.name ?? 'Sessions';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          {step !== 'choose' ? (
            <TouchableOpacity onPress={handleBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {step === 'choose' && renderChoose()}
        {step === 'splits' && renderSplits()}
        {step === 'sessions' && renderSessions()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    minHeight: 280,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  chooseContainer: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 4,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 18,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  optionDesc: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  listRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  listRowSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
