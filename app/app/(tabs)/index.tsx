import { useState, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateSelector, DialGauge, InsightCard } from '../../src/components/shared';
import InteractiveBody from '../../src/components/3d/InteractiveBody';
import { Spinner } from '../../src/components/ui';
import { useRecentStimulus } from '../../src/hooks/useWorkouts';
import {
  musclesToStimulusLevels,
  computeDashboardDials,
  generateInsights,
} from '../../src/utils/analysisTransform';

// Breakpoint: above this = desktop layout (body left, dials right)
const DESKTOP_BREAKPOINT = 600;

const EMPTY_STIMULUS: Record<string, number> = {};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const isDesktop = screenWidth > DESKTOP_BREAKPOINT;

  const handleDragStart = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: false });
  }, []);
  const handleDragEnd = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: true });
  }, []);

  // Fetch rolling 7-day logged workout stimulus
  const { data: analysis, isLoading } = useRecentStimulus(7);

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
    if (analysis && analysis.summary.total_sets > 0) return generateInsights(analysis);
    return [
      {
        title: 'No Recent Training',
        description:
          'Log workouts in the next 7 days to see your recovery map and stimulus distribution.',
      },
    ];
  }, [analysis]);

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

  if (isLoading) return <Spinner fullScreen />;

  return (
    <View style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateRow}>
          <DateSelector />
        </View>

        {isDesktop ? (
          <View style={[styles.mainRow, styles.mainRowDesktop]}>
            <View style={[styles.bodyContainer, { width: bodyWidth, height: bodyHeight }]}>
              <InteractiveBody
                width={bodyWidth}
                height={bodyHeight}
                stimulusLevels={stimulusLevels}
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
        )}

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
      </ScrollView>
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
});
