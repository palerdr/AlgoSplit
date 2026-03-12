import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { DateSelector, DialGauge, InsightCard } from '../../src/components/shared';
import InteractiveBody from '../../src/components/3d/InteractiveBody';
import { Modal, Spinner } from '../../src/components/ui';
import { useRecentStimulus, useWorkoutHistorySummaries } from '../../src/hooks/useWorkouts';
import { startPerfSpan } from '../../src/dev/perfTrace';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useWorkoutStore } from '../../src/stores/workoutStore';
import {
  musclesToStimulusLevels,
  computeDashboardDials,
  generateInsights,
} from '../../src/utils/analysisTransform';

// Breakpoint: above this = desktop layout (body left, dials right)
const DESKTOP_BREAKPOINT = 600;

const EMPTY_STIMULUS: Record<string, number> = {};

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const setSelectedWorkoutDate = useWorkoutStore((s) => s.setSelectedWorkoutDate);
  const stimulusDuration = useSettingsStore((s) => s.stimulusDuration);
  const maintenanceVolume = useSettingsStore((s) => s.maintenanceVolume);
  const dataset = useSettingsStore((s) => s.dataset);
  const isDesktop = screenWidth > DESKTOP_BREAKPOINT;
  const isFocused = useIsFocused();
  const screenLoadSpanRef = useRef<ReturnType<typeof startPerfSpan> | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [resetToken, setResetToken] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const analysisDateKey = useMemo(() => formatDateKey(new Date()), []);
  const analysisTimezoneOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const handleDragStart = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: false });
  }, []);
  const handleDragEnd = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: true });
  }, []);

  useEffect(() => {
    if (isFocused) {
      setResetToken((token) => token + 1);
      setSelectedDate(new Date());
    }
  }, [isFocused]);

  useEffect(() => {
    setSelectedWorkoutDate(selectedDateKey);
  }, [selectedDateKey, setSelectedWorkoutDate]);

  // Fetch rolling 7-day logged workout stimulus snapshot ending on selected day
  const { data: analysis, isLoading } = useRecentStimulus(
    7,
    analysisDateKey,
    analysisTimezoneOffsetMinutes,
    {
      stimulusDuration,
      maintenanceVolume,
      dataset,
    },
  );
  const { data: workoutSummaryData, isLoading: isSummaryLoading } = useWorkoutHistorySummaries({
    days: 61,
    limit: 500,
  });

  const workoutDates = useMemo(
    () =>
      new Set(
        (workoutSummaryData?.workouts ?? []).map((workout) =>
          formatDateKey(new Date(workout.completed_at)),
        ),
      ),
    [workoutSummaryData],
  );
  const hasAnalysisData = (analysis?.summary.total_sets ?? 0) > 0;

  useEffect(() => {
    const isBusy = isLoading || isSummaryLoading;
    if (isBusy && !screenLoadSpanRef.current) {
      screenLoadSpanRef.current = startPerfSpan('mobile:dashboard:screen-load', {
        selectedDate: selectedDateKey,
      });
      return;
    }

    if (!isBusy && screenLoadSpanRef.current) {
      screenLoadSpanRef.current({
        hasAnalysisData,
        summaryCount: workoutSummaryData?.workouts.length ?? 0,
      });
      screenLoadSpanRef.current = null;
    }
  }, [hasAnalysisData, isLoading, isSummaryLoading, selectedDateKey, workoutSummaryData?.workouts.length]);

  // Derive display data from analysis
  const stimulusLevels = useMemo(
    () => (analysis ? musclesToStimulusLevels(analysis.muscles) : EMPTY_STIMULUS),
    [analysis],
  );

  const dials = useMemo(
    () => (analysis ? computeDashboardDials(analysis) : { stimulus: 0, fatigue: 0, recovery: 0 }),
    [analysis],
  );

  const insights = useMemo(() => {
    if (analysis && hasAnalysisData) return generateInsights(analysis);
    return [];
  }, [analysis, hasAnalysisData]);
  const selectedMuscle = useMemo(
    () => analysis?.muscles.find((muscle) => muscle.region_id === selectedRegionId) ?? null,
    [analysis, selectedRegionId],
  );

  // Responsive sizing
  let bodyWidth: number;
  let bodyHeight: number;
  if (isDesktop) {
    bodyHeight = Math.round(Math.min(screenHeight - 120, 800));
    bodyWidth = Math.round(Math.max(bodyHeight / 1.8, screenWidth * 0.22));
  } else {
    bodyWidth = Math.round(screenWidth * 0.55);
    bodyHeight = Math.round(bodyWidth * 1.9);
  }
  const dialSize = isDesktop ? 110 : 90;

  if (isLoading || isSummaryLoading) return <Spinner fullScreen />;

  return (
    <View style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateRow}>
          <DateSelector
            onDateChange={setSelectedDate}
            workoutDates={workoutDates}
            resetToken={resetToken}
          />
        </View>

        {hasAnalysisData ? (
          isDesktop ? (
            <View style={[styles.mainRow, styles.mainRowDesktop]}>
              <View style={[styles.bodyContainer, { width: bodyWidth, height: bodyHeight }]}>
                <InteractiveBody
                  width={bodyWidth}
                  height={bodyHeight}
                  stimulusLevels={stimulusLevels}
                  onRegionPress={setSelectedRegionId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </View>
              <View style={styles.dialsDesktop}>
                <DialGauge
                  value={dials.stimulus}
                  label="Stimulus"
                  size={dialSize}
                  color="#4ADE80"
                  colorEnd="#22C55E"
                  delay={200}
                  labelInside
                />
                <View style={styles.dialGap} />
                <DialGauge
                  value={dials.fatigue}
                  label="Fatigue"
                  size={dialSize}
                  color="#EF4444"
                  colorEnd="#EF4444"
                  delay={400}
                  labelInside
                />
                <View style={styles.dialGap} />
                <DialGauge
                  value={dials.recovery}
                  label="Recovery"
                  size={dialSize}
                  color="#60A5FA"
                  colorEnd="#60A5FA"
                  delay={600}
                  labelInside
                />
              </View>
            </View>
          ) : (
            <View style={styles.mainColumnMobile}>
              <View style={[styles.bodyContainer, { width: bodyWidth, height: bodyHeight }]}>
                <InteractiveBody
                  width={bodyWidth}
                  height={bodyHeight}
                  stimulusLevels={stimulusLevels}
                  onRegionPress={setSelectedRegionId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </View>
              <View style={styles.dialsRowMobile}>
                <DialGauge
                  value={dials.stimulus}
                  label="Stimulus"
                  size={dialSize}
                  color="#4ADE80"
                  colorEnd="#22C55E"
                  delay={200}
                  labelInside
                />
                <DialGauge
                  value={dials.fatigue}
                  label="Fatigue"
                  size={dialSize}
                  color="#EF4444"
                  colorEnd="#EF4444"
                  delay={400}
                  labelInside
                />
                <DialGauge
                  value={dials.recovery}
                  label="Recovery"
                  size={dialSize}
                  color="#60A5FA"
                  colorEnd="#60A5FA"
                  delay={600}
                  labelInside
                />
              </View>
            </View>
          )
        ) : (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateTitle}>No stimulus snapshot for this window</Text>
            <Text style={styles.emptyStateBody}>
              Pick a day with a workout dot, or log a session to populate the 7-day recovery snapshot.
            </Text>
          </View>
        )}

        {hasAnalysisData && (
          <View style={[styles.insightsSection, isDesktop && styles.insightsDesktop]}>
            {insights.map((insight, i) => (
              <InsightCard
                key={i}
                title={insight.title}
                description={insight.description}
                index={i}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={selectedMuscle !== null}
        onClose={() => setSelectedRegionId(null)}
        title={selectedMuscle?.display_name ?? 'Muscle Detail'}
      >
        {selectedMuscle && (
          <View style={styles.muscleModalBody}>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Net stimulus</Text>
              <Text style={styles.muscleMetricValue}>{selectedMuscle.net_stimulus.toFixed(2)}</Text>
            </View>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Raw stimulus</Text>
              <Text style={styles.muscleMetricValue}>{selectedMuscle.stimulus.toFixed(2)}</Text>
            </View>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Atrophy debt</Text>
              <Text style={styles.muscleMetricValue}>{selectedMuscle.atrophy.toFixed(2)}</Text>
            </View>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Primary sets</Text>
              <Text style={styles.muscleMetricValue}>{selectedMuscle.primary_sets}</Text>
            </View>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Prime / secondary / tertiary</Text>
              <Text style={styles.muscleMetricValue}>
                {`${selectedMuscle.prime_sets} / ${selectedMuscle.secondary_sets} / ${selectedMuscle.tertiary_sets}`}
              </Text>
            </View>
            <View style={styles.muscleMetricRow}>
              <Text style={styles.muscleMetricLabel}>Frequency</Text>
              <Text style={styles.muscleMetricValue}>{selectedMuscle.frequency.toFixed(1)}</Text>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  dateRow: {
    paddingTop: 6,
    paddingBottom: 12,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  mainRowDesktop: {
    paddingHorizontal: 24,
    gap: 48,
  },
  bodyContainer: {
    alignItems: 'center',
  },
  dialsDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainColumnMobile: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dialsRowMobile: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 12,
  },
  dialGap: {
    height: 16,
  },
  insightsSection: {
    paddingHorizontal: 20,
  },
  insightsDesktop: {
    paddingHorizontal: 24,
    maxWidth: 700,
  },
  emptyStateCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(232, 232, 232, 0.06)',
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(232, 232, 232, 0.12)',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyStateTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyStateBody: {
    color: 'rgba(232, 232, 232, 0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  muscleModalBody: {
    paddingBottom: 8,
    gap: 12,
  },
  muscleMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  muscleMetricLabel: {
    color: 'rgba(232, 232, 232, 0.72)',
    fontSize: 13,
    flex: 1,
  },
  muscleMetricValue: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '700',
  },
});
