import { View, Text, StyleSheet } from 'react-native';
import { InfoButton } from '../../../src/components/ui';
import { HELP_CONTENT } from '../../../src/data/helpContent';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Compare Splits</Text>
        <InfoButton title={HELP_CONTENT['compare.overview'].title} body={HELP_CONTENT['compare.overview'].body} />
      </View>
      <Text style={styles.subtitle}>Side-by-side analysis coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  title: { color: '#E8E8E8', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#666', fontSize: 14 },
});
