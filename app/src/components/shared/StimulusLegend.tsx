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
 * (maintenance → building → growing → optimal) so the map is self-documenting.
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
        {colors.stimulus.map((_, level) => {
          // One label cell per heat level so each label sits directly under
          // the band it describes. Cells without a labelled band render empty
          // spacers, keeping the ramp and label row column-aligned.
          const band = STIMULUS_LEGEND.find((b) => b.level === level);
          return (
            <View key={level} style={styles.labelCell}>
              {band ? <Text style={styles.label}>{band.label}</Text> : null}
            </View>
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
    alignItems: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
