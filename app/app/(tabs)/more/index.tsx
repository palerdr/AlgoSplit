import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const MENU_ITEMS = [
  { title: 'Progress', icon: 'trending-up-outline' as const, route: '/more/progress' },
  { title: 'Compare Splits', icon: 'git-compare-outline' as const, route: '/more/compare' },
  { title: 'Custom Exercises', icon: 'create-outline' as const, route: '/more/exercises' },
  { title: 'Settings', icon: 'settings-outline' as const, route: '/more/settings' },
  { title: 'Bodyweight', icon: 'scale-outline' as const, route: '/more/bodyweight' },
];

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <Text style={styles.title}>More</Text>
      {MENU_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.title}
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => router.push(item.route as any)}
        >
          <Ionicons name={item.icon} size={22} color="#E8E8E8" />
          <Text style={styles.menuLabel}>{item.title}</Text>
          <Ionicons name="chevron-forward" size={18} color="#555" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#E8E8E8',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#1E1E1E',
    gap: 14,
  },
  menuLabel: {
    flex: 1,
    color: '#E8E8E8',
    fontSize: 16,
    fontWeight: '600',
  },
});
