import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from '../../src/components/ui';
import { colors, typography } from '../../src/theme';
import { resetPassword } from '../../src/api/auth.api';
import { getErrorMessage } from '../../src/api/client';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const missingToken = !token;

  const handleSubmit = async () => {
    if (!token) {
      setError('Reset link is invalid or expired. Please request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSubmitted(true);
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
      <Text style={styles.subtitle}>Choose a new password</Text>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {submitted ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              Your password has been reset. You can now log in with your new password.
            </Text>
            <Button
              title="Go to Log In"
              onPress={() => router.replace('/(auth)/login')}
            />
          </View>
        ) : missingToken ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              Reset link is invalid or expired. Please request a new one.
            </Text>
            <Button
              title="Back to Log In"
              variant="ghost"
              onPress={() => router.replace('/(auth)/login')}
            />
          </View>
        ) : (
          <>
            <Text style={styles.description}>
              Enter a new password for your account. Must be at least 8 characters.
            </Text>
            <Input
              label="New Password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              containerStyle={styles.inputGap}
            />
            <Input
              label="Confirm Password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              containerStyle={styles.inputGap}
            />
            <Button title="Reset Password" onPress={handleSubmit} loading={loading} style={styles.button} />
            <Button
              title="Back to Log In"
              variant="ghost"
              onPress={() => router.replace('/(auth)/login')}
            />
          </>
        )}
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
  description: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
  successContainer: {
    alignItems: 'center',
    gap: 16,
  },
  successText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
});
