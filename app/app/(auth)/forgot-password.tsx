import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from '../../src/components/ui';
import { colors, typography } from '../../src/theme';
import { forgotPassword } from '../../src/api/auth.api';
import { getErrorMessage } from '../../src/api/client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
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
      <Text style={styles.subtitle}>Reset your password</Text>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {submitted ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              If an account with that email exists, we've sent a password reset link.
              Check your inbox.
            </Text>
            <Button
              title="Back to Log In"
              variant="ghost"
              onPress={() => router.back()}
            />
          </View>
        ) : (
          <>
            <Text style={styles.description}>
              Enter your email and we'll send you a link to reset your password.
            </Text>
            <Input
              label="Email"
              placeholder="email@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              containerStyle={styles.inputGap}
            />
            <Button title="Send Reset Link" onPress={handleSubmit} loading={loading} style={styles.button} />
            <Button
              title="Back to Log In"
              variant="ghost"
              onPress={() => router.back()}
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
