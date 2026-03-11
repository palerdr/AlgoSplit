import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, Spinner } from '../../../src/components/ui';
import SummaryTable from '../../../src/components/compare/SummaryTable';
import RadarComparisonChart from '../../../src/components/compare/RadarComparisonChart';
import CompareViewSwitcher, {
  type CompareView,
} from '../../../src/components/compare/CompareViewSwitcher';
import { analyzeSplit } from '../../../src/api/splits.api';
import { useComparisonsList, useDeleteComparison, useSaveComparison } from '../../../src/hooks/useComparisons';
import { useSplitsList } from '../../../src/hooks/useSplits';
import { useCompareStore } from '../../../src/stores/compareStore';
import { borders, colors, spacing, typography } from '../../../src/theme';

const SPLIT_COLORS = ['#ef4444', '#3b82f6', '#22c55e'];

export default function CompareSplitsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: splitsData, isLoading: isSplitsLoading } = useSplitsList();
  const { data: comparisonsData, isLoading: isComparisonsLoading } = useComparisonsList();
  const saveComparisonMutation = useSaveComparison();
  const deleteComparisonMutation = useDeleteComparison();
  const selectedSplitIds = useCompareStore((s) => s.selectedSplitIds);
  const analysisResults = useCompareStore((s) => s.analysisResults);
  const comparisonName = useCompareStore((s) => s.comparisonName);
  const loadedComparisonId = useCompareStore((s) => s.loadedComparisonId);
  const toggleSplitId = useCompareStore((s) => s.toggleSplitId);
  const setSelectedSplitIds = useCompareStore((s) => s.setSelectedSplitIds);
  const setAnalysisResult = useCompareStore((s) => s.setAnalysisResult);
  const setComparisonName = useCompareStore((s) => s.setComparisonName);
  const setLoadedComparisonId = useCompareStore((s) => s.setLoadedComparisonId);
  const [view, setView] = useState<CompareView>('summary');
  const [isRunningCompare, setIsRunningCompare] = useState(false);

  const splits = splitsData?.splits ?? [];
  const savedComparisons = comparisonsData?.comparisons ?? [];

  const comparedItems = useMemo(
    () =>
      selectedSplitIds
        .map((id, index) => {
          const split = splits.find((entry) => entry.id === id);
          const analysis = analysisResults[id];
          if (!split || !analysis) return null;
          return {
            splitId: id,
            splitName: split.name,
            color: SPLIT_COLORS[index] ?? colors.green,
            analysis,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [analysisResults, selectedSplitIds, splits],
  );

  const runComparison = async (ids = selectedSplitIds) => {
    if (ids.length < 2) return;
    setIsRunningCompare(true);
    try {
      const results = await Promise.all(ids.map((id) => analyzeSplit(id, false)));
      ids.forEach((id, index) => {
        setAnalysisResult(id, results[index]);
      });
    } catch {
      Alert.alert('Compare failed', 'Unable to analyze one or more selected splits.');
    } finally {
      setIsRunningCompare(false);
    }
  };

  const handleLoadComparison = async (comparisonId: string) => {
    const comparison = savedComparisons.find((entry) => entry.id === comparisonId);
    if (!comparison) return;
    const limitedSplitIds = comparison.split_ids.slice(0, 3);
    setSelectedSplitIds(limitedSplitIds);
    setComparisonName(comparison.name);
    setLoadedComparisonId(comparison.id);
    await runComparison(limitedSplitIds);
  };

  const handleSaveComparison = async () => {
    if (selectedSplitIds.length < 2) return;
    try {
      const result = await saveComparisonMutation.mutateAsync({
        id: loadedComparisonId,
        data: {
          name: comparisonName.trim() || `Comparison ${new Date().toLocaleDateString()}`,
          split_ids: selectedSplitIds,
        },
      });
      setLoadedComparisonId(result.id);
      setComparisonName(result.name);
      Alert.alert('Saved', loadedComparisonId ? 'Comparison updated.' : 'Comparison saved.');
    } catch {
      Alert.alert('Save failed', 'Unable to save this comparison right now.');
    }
  };

  const handleDeleteComparison = async (comparisonId: string) => {
    try {
      await deleteComparisonMutation.mutateAsync(comparisonId);
      if (loadedComparisonId === comparisonId) {
        setLoadedComparisonId(null);
      }
    } catch {
      Alert.alert('Delete failed', 'Unable to remove this saved comparison.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/splits')} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Compare Splits</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.subtitle}>Select two or three splits, then run analysis side by side.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Comparisons</Text>
        {isComparisonsLoading ? (
          <Spinner />
        ) : savedComparisons.length === 0 ? (
          <Text style={styles.sectionHint}>No saved comparisons yet.</Text>
        ) : (
          savedComparisons.map((comparison) => (
            <View key={comparison.id} style={styles.savedRow}>
              <TouchableOpacity
                style={styles.savedLoadButton}
                onPress={() => handleLoadComparison(comparison.id)}
              >
                <Text style={styles.savedLoadTitle}>{comparison.name}</Text>
                <Text style={styles.savedLoadMeta}>{comparison.split_ids.length} splits</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.savedDeleteButton}
                onPress={() => handleDeleteComparison(comparison.id)}
              >
                <Text style={styles.savedDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pick Splits</Text>
        <Text style={styles.selectionCount}>{selectedSplitIds.length} of 3 selected</Text>
        {isSplitsLoading ? (
          <Spinner />
        ) : (
          splits.map((split) => {
            const selectedIndex = selectedSplitIds.indexOf(split.id);
            const active = selectedIndex >= 0;
            return (
              <TouchableOpacity
                key={split.id}
                style={[
                  styles.splitCard,
                  active && {
                    borderColor: SPLIT_COLORS[selectedIndex],
                    backgroundColor: 'rgba(255,255,255,0.05)',
                  },
                ]}
                onPress={() => toggleSplitId(split.id)}
              >
                <View style={styles.splitMeta}>
                  <Text style={styles.splitName}>{split.name}</Text>
                  <Text style={styles.splitStats}>
                    {split.sessions.length} sessions • {split.stimulus_duration}h • {split.dataset}
                  </Text>
                </View>
                <View
                  style={[
                    styles.selectionBadge,
                    active && { backgroundColor: SPLIT_COLORS[selectedIndex] },
                  ]}
                >
                  <Text style={[styles.selectionBadgeText, active && styles.selectionBadgeTextActive]}>
                    {active ? selectedIndex + 1 : '+'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Input
          label="Comparison Name"
          placeholder="Optional saved comparison name"
          value={comparisonName}
          onChangeText={setComparisonName}
        />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (selectedSplitIds.length < 2 || isRunningCompare) && styles.buttonDisabled,
          ]}
          disabled={selectedSplitIds.length < 2 || isRunningCompare}
          onPress={() => runComparison()}
        >
          <Text style={styles.primaryButtonText}>
            {isRunningCompare ? 'Analyzing...' : 'Compare'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            (selectedSplitIds.length < 2 || saveComparisonMutation.isPending) && styles.buttonDisabled,
          ]}
          disabled={selectedSplitIds.length < 2 || saveComparisonMutation.isPending}
          onPress={handleSaveComparison}
        >
          <Text style={styles.secondaryButtonText}>
            {loadedComparisonId ? 'Update' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {comparedItems.length >= 2 ? (
        <View style={styles.resultsSection}>
          <View style={styles.resultsModule}>
            <Text style={styles.resultsTitle}>Results</Text>
            <CompareViewSwitcher value={view} onChange={setView} />
            {view === 'summary' ? <SummaryTable items={comparedItems} /> : null}
            {view === 'radar' ? <RadarComparisonChart items={comparedItems} /> : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerSpacer: {
    width: 24,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  selectionCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  splitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  splitMeta: {
    flex: 1,
  },
  splitName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  splitStats: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  selectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadgeText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  selectionBadgeTextActive: {
    color: '#111',
  },
  savedRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  savedLoadButton: {
    flex: 1,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  savedLoadTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  savedLoadMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  savedDeleteButton: {
    width: 78,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedDeleteText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: borders.radius.xl,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    width: 108,
    minHeight: 48,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  resultsSection: {
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  resultsModule: {
    width: '100%',
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    alignItems: 'center',
  },
  resultsTitle: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
});
