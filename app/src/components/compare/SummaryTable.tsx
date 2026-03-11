import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AnalysisResponse } from '../../types/api.types';
import { borders, colors } from '../../theme';

interface SummaryTableProps {
  items: Array<{
    splitId: string;
    splitName: string;
    color: string;
    analysis: AnalysisResponse;
  }>;
}

type Metric = {
  label: string;
  getValue: (analysis: AnalysisResponse) => number;
  format: (value: number) => string;
  higherIsBetter: boolean;
};

const METRICS: Metric[] = [
  {
    label: 'Total Sets',
    getValue: (analysis) => analysis.summary.total_sets,
    format: (value) => value.toFixed(0),
    higherIsBetter: true,
  },
  {
    label: 'Muscles Trained',
    getValue: (analysis) => analysis.summary.muscles_trained,
    format: (value) => value.toFixed(0),
    higherIsBetter: true,
  },
  {
    label: 'Avg Net Stimulus',
    getValue: (analysis) => analysis.summary.avg_net_stimulus,
    format: (value) => value.toFixed(2),
    higherIsBetter: true,
  },
  {
    label: 'Avg Sets / Muscle',
    getValue: (analysis) => analysis.summary.avg_sets_per_muscle,
    format: (value) => value.toFixed(1),
    higherIsBetter: true,
  },
  {
    label: 'Cycle Length',
    getValue: (analysis) => analysis.cycle_length,
    format: (value) => `${value.toFixed(0)}d`,
    higherIsBetter: false,
  },
  {
    label: 'Suggestions',
    getValue: (analysis) => analysis.suggestions.length,
    format: (value) => value.toFixed(0),
    higherIsBetter: false,
  },
];

export default function SummaryTable({ items }: SummaryTableProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.table}>
        <View style={styles.headerRow}>
          <View style={styles.metricHeaderCell}>
            <Text style={styles.metricHeaderText}>Metric</Text>
          </View>
          {items.map((item) => (
            <View key={item.splitId} style={[styles.valueCell, styles.headerValueCell]}>
              <View style={[styles.colorChip, { backgroundColor: item.color }]} />
              <Text style={styles.headerValueText} numberOfLines={2}>
                {item.splitName}
              </Text>
            </View>
          ))}
        </View>

        {METRICS.map((metric) => {
          const values = items.map((item) => metric.getValue(item.analysis));
          const target = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);

          return (
            <View key={metric.label} style={styles.row}>
              <View style={styles.metricCell}>
                <Text style={styles.metricText}>{metric.label}</Text>
              </View>
              {items.map((item, index) => {
                const value = values[index];
                const isBest = value === target;
                return (
                  <View
                    key={item.splitId}
                    style={[styles.valueCell, isBest && styles.bestCell]}
                  >
                    <Text style={[styles.valueText, isBest && styles.bestValueText]}>
                      {metric.format(value)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  table: {
    borderWidth: borders.width.thin,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: borders.radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: borders.width.thin,
    borderTopColor: colors.border,
  },
  metricHeaderCell: {
    width: 132,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  metricCell: {
    width: 132,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  headerValueCell: {
    minHeight: 60,
  },
  valueCell: {
    width: 116,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricHeaderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  headerValueText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  valueText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  bestCell: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
  },
  bestValueText: {
    color: colors.green,
  },
  colorChip: {
    width: 12,
    height: 12,
    borderRadius: 999,
    marginBottom: 8,
  },
});
