import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { Spinner } from '../../src/components/ui';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner fullScreen />;
  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
