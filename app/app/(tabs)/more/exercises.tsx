import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ExercisesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Custom Exercises</Text>
      <Text style={styles.subtitle}>Exercise editor coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#E8E8E8', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#666', fontSize: 14 },
});
