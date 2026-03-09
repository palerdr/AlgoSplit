import { View, StyleSheet } from 'react-native';

export default function WorkoutPlaceholder() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
});
