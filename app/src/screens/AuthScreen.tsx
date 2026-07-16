import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAccountState } from '../state/AccountState';
import { theme } from '../theme';
import FadeIn from '../ui/FadeIn';
import Glass from '../ui/Glass';

export default function AuthScreen() {
  const account = useAccountState();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    try {
      if (mode === 'login') await account.login(email.trim(), password);
      else await account.signup(email.trim(), password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed.');
    }
  };

  if (account.status === 'checking') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={theme.accent} />
        <Text style={styles.checking}>Connecting to your account…</Text>
      </View>
    );
  }

  if (account.status === 'unconfigured') {
    return (
      <View style={styles.container}>
        <FadeIn>
          <Glass style={styles.card}>
            <Text style={styles.brand}>AlgoSplit</Text>
            <Text style={styles.title}>Backend not configured</Text>
            <Text style={styles.body}>
              Set EXPO_PUBLIC_ALGOSPLIT_API in app/.env and restart Expo.
            </Text>
          </Glass>
        </FadeIn>
      </View>
    );
  }

  if (account.status === 'error') {
    return (
      <View style={styles.container}>
        <FadeIn>
          <Glass style={styles.card}>
            <Text style={styles.brand}>AlgoSplit</Text>
            <Text style={styles.title}>Account connection failed</Text>
            <Text style={styles.body}>{account.sessionError ?? 'Could not reach the backend.'}</Text>
            <Pressable onPress={account.refreshSession}>
              <Glass style={styles.primaryButton} interactive>
                <Text style={styles.primaryText}>Retry</Text>
              </Glass>
            </Pressable>
          </Glass>
        </FadeIn>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FadeIn>
        <Glass style={styles.card}>
          <Text style={styles.brand}>AlgoSplit</Text>
          <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={styles.body}>
            {mode === 'login'
              ? 'Sign in to load your splits, workouts, and progress.'
              : 'Create an account to keep your training data in sync.'}
          </Text>

          {(error || account.sessionError) && (
            <Text style={styles.error}>{error ?? account.sessionError}</Text>
          )}

          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            placeholder="Password"
            placeholderTextColor={theme.textDim}
            secureTextEntry
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            style={styles.input}
          />

          <Pressable onPress={submit}>
            <Glass style={styles.primaryButton} interactive>
              <Text style={styles.primaryText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
            </Glass>
          </Pressable>

          <Pressable
            onPress={() => {
              setMode((current) => (current === 'login' ? 'signup' : 'login'));
              setError(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.switchText}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </Glass>
      </FadeIn>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  checking: {
    color: theme.textDim,
    fontSize: 13,
    marginTop: 14,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    padding: 24,
  },
  brand: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 22,
  },
  error: {
    color: '#E27878',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  input: {
    color: theme.text,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 11,
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 5,
  },
  primaryText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  switchText: {
    color: theme.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
  },
});
