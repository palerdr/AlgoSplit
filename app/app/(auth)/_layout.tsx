import { Stack, Redirect, useSegments } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { Spinner } from '../../src/components/ui';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  // Authenticated users can still receive a recovery email and tap it on the
  // device they're signed in on, so let reset-password through the auth gate.
  const onResetPassword = segments[segments.length - 1] === 'reset-password';

  if (isLoading) return <Spinner fullScreen />;
  if (isAuthenticated && !onResetPassword) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
