import { Stack } from 'expo-router';

export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="progress" />
      <Stack.Screen name="compare" />
      <Stack.Screen name="exercises" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="bodyweight" />
    </Stack>
  );
}
