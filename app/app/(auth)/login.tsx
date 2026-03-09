import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from '../../src/components/ui';
import { colors, typography } from '../../src/theme';
import { useAuth } from '../../src/hooks/useAuth';
import { getErrorMessage } from '../../src/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // Redirect happens automatically via layout guard
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top + 60 }]}
    >
      <Text style={styles.title}>AlgoSplit</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Input
          label="Email"
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          containerStyle={styles.inputGap}
        />
        <Input
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          containerStyle={styles.inputGap}
        />
        <Button title="Log In" onPress={handleLogin} loading={loading} style={styles.button} />
        <Button
          title="Create Account"
          variant="ghost"
          onPress={() => router.push('/(auth)/signup')}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
  },
  title: {
    ...typography.h1,
    color: colors.green,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    gap: 4,
  },
  inputGap: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    marginBottom: 12,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
});
