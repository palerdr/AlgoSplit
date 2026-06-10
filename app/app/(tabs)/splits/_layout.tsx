import { Stack } from 'expo-router';

export default function SplitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="create" />
      <Stack.Screen name="import" />
      <Stack.Screen name="compare" />
    </Stack>
  );
}
