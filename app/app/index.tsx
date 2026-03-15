import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { Spinner } from '../src/components/ui';
import LandingPage from '../src/components/landing/LandingPage';

export default function RootIndex() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner fullScreen />;
  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  // On native, skip the landing page and go straight to login
  if (Platform.OS !== 'web') return <Redirect href="/(auth)/login" />;

  return <LandingPage />;
}
