import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import type { AnalysisResponse } from '../../types/api.types';
import { colors } from '../../theme';

interface RadarComparisonChartProps {
  items: Array<{
    splitId: string;
    splitName: string;
    color: string;
    analysis: AnalysisResponse;
  }>;
}

const GROUP_LABELS = [
  'Chest',
  'Shoulders',
  'Upper Back',
  'Low Back',
  'Lats',
  'Elbow Flex',
  'Forearms',
  'Triceps',
  'Glutes',
  'Quads',
  'Hams',
  'Calves',
  'Adductors',
  'Abs',
] as const;

const GROUP_ALIASES: Record<(typeof GROUP_LABELS)[number], string[]> = {
  Chest: ['chest', 'pecs', 'pectorals'],
  Shoulders: ['shoulders', 'delts', 'deltoids'],
  'Upper Back': ['upper back', 'traps', 'mid back'],
  'Low Back': ['low back', 'spinal erectors', 'erectors'],
  Lats: ['lats', 'latissimus'],
  'Elbow Flex': ['elbow flexors', 'biceps'],
  Forearms: ['forearms', 'brachioradialis'],
  Triceps: ['triceps'],
  Glutes: ['glutes', 'glute max', 'glute med'],
  Quads: ['quads', 'quadriceps'],
  Hams: ['hams', 'hamstrings'],
  Calves: ['calves'],
  Adductors: ['adductors'],
  Abs: ['abs', 'abdominals', 'core'],
};

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 118;

function normalizeGroupName(name: string) {
  return name.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function getGroupStimulus(analysis: AnalysisResponse, label: (typeof GROUP_LABELS)[number]) {
  const aliases = GROUP_ALIASES[label];
  for (const summary of analysis.group_summaries ?? analysis.summary.group_summaries ?? []) {
    const normalized = normalizeGroupName(summary.group);
    if (aliases.some((alias) => normalized.includes(alias))) {
      return summary.total_net_stimulus;
    }
  }
  return 0;
}

function polarPoint(index: number, total: number, radius: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

export default function RadarComparisonChart({ items }: RadarComparisonChartProps) {
  const maxValue = useMemo(
    () =>
      Math.max(
        1,
        ...items.flatMap((item) => GROUP_LABELS.map((label) => getGroupStimulus(item.analysis, label))),
      ),
    [items],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE}>
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const points = GROUP_LABELS.map((_, index) => {
              const point = polarPoint(index, GROUP_LABELS.length, RADIUS * ratio);
              return `${point.x},${point.y}`;
            }).join(' ');
            return (
              <Polygon
                key={ratio}
                points={points}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            );
          })}

          {GROUP_LABELS.map((label, index) => {
            const axisPoint = polarPoint(index, GROUP_LABELS.length, RADIUS);
            const labelPoint = polarPoint(index, GROUP_LABELS.length, RADIUS + 24);
            return [
              <Line
                key={`${label}-line`}
                x1={CENTER}
                y1={CENTER}
                x2={axisPoint.x}
                y2={axisPoint.y}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1}
              />,
              <SvgText
                key={`${label}-text`}
                x={labelPoint.x}
                y={labelPoint.y}
                fill={colors.textSecondary}
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
              >
                {label}
              </SvgText>,
            ];
          })}

          <Circle cx={CENTER} cy={CENTER} r={2} fill="rgba(255,255,255,0.28)" />

          {items.map((item) => {
            const points = GROUP_LABELS.map((label, index) => {
              const value = getGroupStimulus(item.analysis, label);
              const point = polarPoint(index, GROUP_LABELS.length, (value / maxValue) * RADIUS);
              return `${point.x},${point.y}`;
            }).join(' ');

            return (
              <Polygon
                key={item.splitId}
                points={points}
                fill={item.color}
                fillOpacity={0.15}
                stroke={item.color}
                strokeWidth={2}
              />
            );
          })}
        </Svg>

        <View style={styles.legend}>
          {items.map((item) => (
            <View key={item.splitId} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.splitName}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
