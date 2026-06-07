import { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { getErrorMessage } from '../../api/client';
import { Spinner, Card, InfoButton } from '../ui';
import AnalysisTabView from '../analysis/AnalysisTabView';
import { HELP_CONTENT } from '../../data/helpContent';
import { colors, borders, spacing } from '../../theme';
import type { AnalysisResponse, SplitResponse } from '../../types/api.types';

interface Props {
  split: SplitResponse;
  analysis: AnalysisResponse | undefined;
  analysisLoading: boolean;
  analysisError: unknown;

  // Advanced settings (lifted in the parent so dial recomputes invalidate
  // queries the same way they did before the layout change)
  advDataset: 'schoenfeld' | 'pelland' | 'average';
  advCycleLength: string;
  advStimulusDuration: string;
  advMaintenanceVolume: string;
  onAdvDatasetChange: (d: 'schoenfeld' | 'pelland' | 'average') => void;
  onAdvCycleLengthChange: (v: string) => void;
  onAdvCycleLengthBlur: () => void;
  onAdvStimulusChange: (v: string) => void;
  onAdvStimulusBlur: () => void;
  onAdvMaintenanceChange: (v: string) => void;
  onAdvMaintenanceBlur: () => void;
  savingAdvSettings: boolean;
}

/**
 * Page-2 ("Analysis") content for the split detail screen.
 *
 * Previously this lived under the sessions list, hidden behind a "Detailed
 * Analysis" collapse and a stack of dropdowns. Now it's a peer page swiped to
 * from the Split page — same data, flattened: summary stats up top, advanced
 * settings inline (no collapse), then the Regions / Breakdown tabs. The only
 * remaining nesting is inside the Regions/Breakdown views themselves, which
 * is content navigation rather than a UX bug.
 */
export default function SplitAnalysisPageMobile({
  split,
  analysis,
  analysisLoading,
  analysisError,
  advDataset,
  advCycleLength,
  advStimulusDuration,
  advMaintenanceVolume,
  onAdvDatasetChange,
  onAdvCycleLengthChange,
  onAdvCycleLengthBlur,
  onAdvStimulusChange,
  onAdvStimulusBlur,
  onAdvMaintenanceChange,
  onAdvMaintenanceBlur,
  savingAdvSettings,
}: Props) {
  const { topMuscle, bottomMuscle } = useMemo(() => {
    // Only consider muscles that actually received stimulus this split — the
    // backend returns all ~29 regions including untrained ones (stimulus 0,
    // net ≤ 0). Without this filter "Lowest Trained" would surface an
    // untrained region reading 0.0, contradicting its own label.
    const trained = (analysis?.muscles ?? []).filter((m) => m.stimulus > 0);
    if (trained.length === 0) {
      return { topMuscle: undefined, bottomMuscle: undefined };
    }
    const sorted = [...trained].sort((a, b) => b.net_stimulus - a.net_stimulus);
    return { topMuscle: sorted[0], bottomMuscle: sorted[sorted.length - 1] };
  }, [analysis]);

  return (
    <View style={styles.container}>
      {/* Summary stats — 2x2 grid. Only meaningful with analysis data; while
          loading/errored we omit it but keep the settings card below mounted. */}
      {analysis && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Stimulus</Text>
            <Text style={[styles.statValue, { color: colors.green }]}>
              {analysis.summary.avg_net_stimulus.toFixed(1)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Muscles Trained</Text>
            <Text style={[styles.statValue, { color: colors.blue }]}>
              {analysis.summary.muscles_trained}/{analysis.summary.total_muscles}
            </Text>
          </View>
          {topMuscle && (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Top Muscle</Text>
              <Text style={[styles.statValue, { color: '#4ADE80' }]} numberOfLines={1}>
                {topMuscle.display_name}
              </Text>
              <Text style={styles.statSubValue}>{topMuscle.net_stimulus.toFixed(1)}</Text>
            </View>
          )}
          {bottomMuscle && (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Lowest Trained</Text>
              <Text style={[styles.statValue, { color: '#EF4444' }]} numberOfLines={1}>
                {bottomMuscle.display_name}
              </Text>
              <Text style={styles.statSubValue}>{bottomMuscle.net_stimulus.toFixed(1)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Advanced settings — flattened, no collapse */}
      <Card style={styles.advCard}>
        <View style={styles.advHeader}>
          <Text style={styles.advTitle}>Analysis Settings</Text>
          <InfoButton
            title={HELP_CONTENT['splits.detailedAnalysis'].title}
            body={HELP_CONTENT['splits.detailedAnalysis'].body}
          />
        </View>
        <View style={styles.datasetRow}>
          <Text style={styles.advLabel}>Dataset</Text>
          <View style={styles.datasetPills}>
            {(['schoenfeld', 'pelland', 'average'] as const).map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.pill, advDataset === d && styles.pillActive]}
                onPress={() => onAdvDatasetChange(d)}
              >
                <Text style={[styles.pillText, advDataset === d && styles.pillTextActive]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.advInputRow}>
          <Text style={styles.advLabel}>Cycle Length (days)</Text>
          <TextInput
            style={styles.advTextInput}
            value={advCycleLength}
            onChangeText={onAdvCycleLengthChange}
            onBlur={onAdvCycleLengthBlur}
            keyboardType="numeric"
            placeholder="Auto"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.advInputRow}>
          <Text style={styles.advLabel}>Stimulus Duration (hrs)</Text>
          <TextInput
            style={styles.advTextInput}
            value={advStimulusDuration}
            onChangeText={onAdvStimulusChange}
            onBlur={onAdvStimulusBlur}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.advInputRow}>
          <Text style={styles.advLabel}>Maintenance Volume (sets)</Text>
          <TextInput
            style={styles.advTextInput}
            value={advMaintenanceVolume}
            onChangeText={onAdvMaintenanceChange}
            onBlur={onAdvMaintenanceBlur}
            keyboardType="numeric"
          />
        </View>
        {savingAdvSettings && (
          <View style={styles.savingIndicator}>
            <Spinner />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
      </Card>

      {/* Analysis data region — loading / error / content. Lives BELOW the
          settings card so a failed analysis (e.g. an out-of-range setting that
          422s) never hides the controls the user needs to fix it. */}
      {analysisLoading ? (
        <Spinner style={styles.spinner} />
      ) : analysisError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Analysis unavailable</Text>
          <Text style={styles.errorBody}>{getErrorMessage(analysisError)}</Text>
          <Text style={styles.errorHint}>
            Check the Analysis Settings above — an out-of-range value can stop the
            analysis from running. Adjust a setting and it will refresh automatically.
          </Text>
        </Card>
      ) : analysis ? (
        <AnalysisTabView splitId={split.id} analysis={analysis} splitData={split} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  spinner: {
    marginTop: 40,
  },
  errorCard: {
    margin: spacing.md,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorBody: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  errorHint: {
    color: colors.textMuted,
    fontSize: 11,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.md,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: 12,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statSubValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  advCard: {
    padding: spacing.md,
    gap: 10,
  },
  advHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  advTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  datasetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  datasetPills: {
    flexDirection: 'row',
    gap: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borders.radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  pillActive: {
    backgroundColor: colors.greenMuted,
  },
  pillText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.green,
  },
  advInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  advLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  advTextInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borders.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.text,
    fontSize: 14,
    minWidth: 70,
    textAlign: 'right',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  savingText: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
