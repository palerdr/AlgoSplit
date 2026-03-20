import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import GroupSummaryCards from './GroupSummaryCards';
import StimulusBreakdownMobile from './StimulusBreakdownMobile';
import { Spinner } from '../ui';
import { useSplitAnalysisWithBreakdowns } from '../../hooks/useSplits';
import type { AnalysisResponse } from '../../types/api.types';

const TABS = ['Groups', 'Breakdown'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  splitId: string;
  analysis: AnalysisResponse;
}

export default function AnalysisTabView({ splitId, analysis }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Groups');
  const shouldLoadBreakdown = activeTab === 'Breakdown';
  const { data: fullAnalysis, isLoading: isBreakdownLoading } = useSplitAnalysisWithBreakdowns(
    splitId,
    shouldLoadBreakdown
  );
  const breakdownData = fullAnalysis?.session_breakdowns ?? analysis.session_breakdowns ?? [];

  return (
    <View>
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'Groups' ? (
          <GroupSummaryCards muscles={analysis.muscles ?? []} />
        ) : isBreakdownLoading ? (
          <Spinner style={styles.breakdownSpinner} />
        ) : (
          <StimulusBreakdownMobile sessionBreakdowns={breakdownData} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borders.radius.lg,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borders.radius.md,
  },
  tabActive: {
    backgroundColor: colors.surfaceElevated,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
  },
  content: {
    minHeight: 100,
  },
  breakdownSpinner: {
    marginTop: spacing.md,
  },
});
