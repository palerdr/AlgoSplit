import { View, Text, StyleSheet } from 'react-native';
import { colors, borders } from '../../theme';
import { STIMULUS_LEGEND, MAX_STIMULUS_LEVEL } from '../../analysis/stimulusScale';

interface Props {
  /** Optional width to match the body map it sits under. */
  width?: number;
}

/**
 * Compact legend that explains the body-map colors. Shows the full 0–7 heat
 * ramp as a gradient strip with the key physiological anchors labelled
 * (maintain → growing → optimal) so the map is self-documenting.
 */
export default function StimulusLegend({ width }: Props) {
  return (
    <View style={[styles.container, width ? { width } : null]}>
      <View style={styles.ramp}>
        {colors.stimulus.map((c, level) => (
          <View
            key={level}
            style={[
              styles.swatch,
              { backgroundColor: c },
              level === 0 && styles.swatchStart,
              level === MAX_STIMULUS_LEVEL && styles.swatchEnd,
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {STIMULUS_LEGEND.map((band, i) => {
          // Three evenly-spaced cells: first pinned left, last pinned right,
          // middle ("Growing") centered — so the anchor labels read as the
          // start / midpoint / end of the ramp rather than sitting under their
          // exact heat-level swatch.
          const align = i === 0 ? 'left' : i === STIMULUS_LEGEND.length - 1 ? 'right' : 'center';
          return (
            <Text key={band.label} style={[styles.labelCell, styles.label, { textAlign: align }]}>
              {band.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    alignSelf: 'center',
  },
  ramp: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  swatch: {
    flex: 1,
  },
  swatchStart: {
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  swatchEnd: {
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  labels: {
    flexDirection: 'row',
  },
  labelCell: {
    flex: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
