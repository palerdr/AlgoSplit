import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import DateSelector from '../../components/DateSelector';
import DialGauge from '../../components/DialGauge';
import InsightCard from '../../components/InsightCard';
import BodyModel from '../../components/BodyModel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODEL_WIDTH = SCREEN_WIDTH * 0.38;
const MODEL_HEIGHT = SCREEN_WIDTH * 1.0;

export default function DashboardScreen() {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {/* Date Selector */}
        <View style={styles.dateRow}>
          <DateSelector />
        </View>

        {/* Body Model + Dials Row */}
        <View style={styles.mainRow}>
          <View style={styles.modelContainer}>
            <BodyModel
              width={MODEL_WIDTH}
              height={MODEL_HEIGHT}
              onDragStart={() => setScrollEnabled(false)}
              onDragEnd={() => setScrollEnabled(true)}
            />
          </View>

          {/* Staggered dials */}
          <View style={styles.dialsContainer}>
            <View style={styles.dialStaggerRight}>
              <DialGauge
                value={72}
                label="Stimulus"
                size={120}
                color="#4ADE80"
                colorEnd="#22C55E"
                delay={200}
                labelInside
              />
            </View>
            <View style={styles.dialGap} />
            <View style={styles.dialStaggerLeft}>
              <DialGauge
                value={45}
                label="Fatigue"
                size={120}
                color="#E8E8E8"
                colorEnd="#CCCCCC"
                delay={400}
                labelInside
              />
            </View>
            <View style={styles.dialGap} />
            <View style={styles.dialStaggerRight}>
              <DialGauge
                value={68}
                label="Recovery"
                size={120}
                color="#E8E8E8"
                colorEnd="#CCCCCC"
                delay={600}
                labelInside
              />
            </View>
          </View>
        </View>

        {/* Insight Cards */}
        <View style={styles.insightsSection}>
          <InsightCard
            title="Recovery Status"
            description="Upper body well recovered. Lower body fatigue moderate — consider an upper-focused day."
            index={0}
          />
          <InsightCard
            title="Training Suggestion"
            description="You're 68% through your weekly volume target. Push/Pull split recommended today for optimal stimulus."
            index={1}
          />
          <InsightCard
            title="Trend Alert"
            description="Net stimulus has been rising for 3 consecutive sessions. Consider a deload in the next 4-5 days."
            index={2}
          />
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
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  modelContainer: {
    width: MODEL_WIDTH,
    height: MODEL_HEIGHT,
  },
  dialsContainer: {
    flex: 1,
    paddingLeft: 2,
    justifyContent: 'center',
  },
  dialStaggerRight: {
    alignSelf: 'flex-end',
    paddingRight: 16,
  },
  dialStaggerLeft: {
    alignSelf: 'flex-start',
    paddingLeft: 16,
  },
  dialGap: {
    height: 6,
  },

  insightsSection: {
    paddingHorizontal: 20,
  },
});
