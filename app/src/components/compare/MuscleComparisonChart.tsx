import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import type { AnalysisResponse } from '../../types/api.types';
import { borders, colors } from '../../theme';

interface MuscleComparisonChartProps {
  items: Array<{
    splitId: string;
    splitName: string;
    color: string;
    analysis: AnalysisResponse;
  }>;
}

type MuscleRow = {
  muscle: string;
  values: Record<string, number>;
};

const CHART_WIDTH = 680;
const LABEL_WIDTH = 132;
const ROW_HEIGHT = 38;
const BAR_HEIGHT = 7;

export default function MuscleComparisonChart({ items }: MuscleComparisonChartProps) {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const muscleMap = new Map<string, MuscleRow>();

    for (const item of items) {
      for (const muscle of item.analysis.muscles) {
        const existing = muscleMap.get(muscle.display_name) ?? {
          muscle: muscle.display_name,
          values: {},
        };
        existing.values[item.splitId] = muscle.net_stimulus;
        muscleMap.set(muscle.display_name, existing);
      }
    }

    return Array.from(muscleMap.values())
      .sort((a, b) => {
        const aMax = Math.max(...Object.values(a.values), 0);
        const bMax = Math.max(...Object.values(b.values), 0);
        return bMax - aMax;
      });
  }, [items]);

  const visibleRows = showAll ? rows : rows.slice(0, 12);
  const maxStimulus = Math.max(
    1,
    ...rows.map((row) => Math.max(...Object.values(row.values), 0)),
  );
  const chartHeight = visibleRows.length * ROW_HEIGHT + 28;
  const plotWidth = CHART_WIDTH - LABEL_WIDTH - 24;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartCard}>
          <Svg width={CHART_WIDTH} height={chartHeight}>
            {visibleRows.map((row, rowIndex) => {
              const baseY = 18 + rowIndex * ROW_HEIGHT;
              const labelY = baseY + 10;

              return [
                <SvgText
                  key={`${row.muscle}-label`}
                  x={10}
                  y={labelY}
                  fill={colors.text}
                  fontSize="12"
                  fontWeight="700"
                >
                  {row.muscle}
                </SvgText>,
                ...items.map((item, splitIndex) => {
                  const value = row.values[item.splitId] ?? 0;
                  const barWidth = (value / maxStimulus) * plotWidth;
                  const y = baseY + splitIndex * 9;
                  return (
                    <Rect
                      key={`${row.muscle}-${item.splitId}`}
                      x={LABEL_WIDTH}
                      y={y}
                      width={Math.max(barWidth, value > 0 ? 3 : 0)}
                      height={BAR_HEIGHT}
                      rx={BAR_HEIGHT / 2}
                      fill={item.color}
                      opacity={0.9}
                    />
                  );
                }),
              ];
            })}
          </Svg>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.toggle} onPress={() => setShowAll((value) => !value)}>
        <Text style={styles.toggleText}>{showAll ? 'Show Top 12' : 'Show All 29'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
