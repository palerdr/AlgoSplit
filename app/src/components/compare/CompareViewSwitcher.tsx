import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borders, colors } from '../../theme';

export type CompareView = 'summary' | 'radar';

interface CompareViewSwitcherProps {
  value: CompareView;
  onChange: (value: CompareView) => void;
}

const OPTIONS: Array<{ key: CompareView; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'radar', label: 'Radar' },
];

export default function CompareViewSwitcher({ value, onChange }: CompareViewSwitcherProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(option.key)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  pill: {
    flex: 1,
    minHeight: 40,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pillActive: {
    borderColor: colors.green,
    backgroundColor: colors.greenMuted,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  pillTextActive: {
    color: colors.green,
  },
});
