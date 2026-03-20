import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, borders, spacing } from '../../theme';
import GroupSummaryCards from './GroupSummaryCards';
import StimulusBreakdownMobile from './StimulusBreakdownMobile';
import { InfoButton } from '../ui';
import { HELP_CONTENT } from '../../data/helpContent';
import type { AnalysisResponse } from '../../types/api.types';

const TABS = ['Regions', 'Breakdown'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  splitId: string;
  analysis: AnalysisResponse;
}

export default function AnalysisTabView({ analysis }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Regions');
  // After P4 optimization, analysis always includes breakdowns —
  // no separate fetch needed for the Breakdown tab.
  const breakdownData = analysis.session_breakdowns ?? [];

  return (
    <View>
      <View style={styles.tabRow}>
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
        <InfoButton title={HELP_CONTENT['splits.regionsTabs'].title} body={HELP_CONTENT['splits.regionsTabs'].body} size={15} />
      </View>

      <View style={styles.content}>
        {activeTab === 'Regions' ? (
          <GroupSummaryCards muscles={analysis.muscles ?? []} />
        ) : (
          <StimulusBreakdownMobile sessionBreakdowns={breakdownData} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
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
});
