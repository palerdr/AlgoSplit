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
import PrivacyScreen from './PrivacyScreen';
import { authErrorMessageForDisplay, type SocialProvider } from '../api/backend';
import {
  isSocialAuthCancellation,
  socialAuthConfigured,
  socialAuthErrorMessageForDisplay,
  socialProviderVisible,
} from '../auth/socialAuth';
import SocialProviderIcon from '../ui/SocialProviderIcon';

export default function AuthScreen() {
  const account = useAccountState();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const socialConfigured = socialAuthConfigured();

  const submit = async () => {
    if (!email.trim() || (mode !== 'forgot' && !password)) {
      setError(mode === 'forgot' ? 'Enter your email.' : 'Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      if (mode === 'login') await account.login(email.trim(), password);
      else if (mode === 'signup') {
        const signupMessage = await account.signup(email.trim(), password);
        if (signupMessage) {
          setMessage(signupMessage);
          setPassword('');
          return;
        }
      }
      else {
        setMessage(await account.forgotPassword(email.trim()));
        return;
      }
      setPassword('');
    } catch (cause) {
      const fallback =
        mode === 'signup'
          ? 'Could not create account. Try again.'
          : mode === 'forgot'
            ? 'Could not send a reset link. Try again.'
            : 'Could not sign in. Try again.';
      setError(authErrorMessageForDisplay(cause, fallback));
    }
  };

  const submitSocial = async (provider: SocialProvider) => {
    setError(null);
    setMessage(null);
    setSocialBusy(provider);
    try {
      await account.signInWithProvider(provider);
    } catch (cause) {
      if (!isSocialAuthCancellation(cause)) {
        setError(
          authErrorMessageForDisplay(
            cause,
            socialAuthErrorMessageForDisplay(cause, 'Could not sign in. Try again.')
          )
        );
      }
    } finally {
      setSocialBusy(null);
    }
  };

  if (showPrivacy) return <PrivacyScreen onBack={() => setShowPrivacy(false)} />;

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
          <Text style={styles.title}>
            {mode === 'login'
              ? 'Welcome back'
              : mode === 'signup'
                ? 'Create your account'
                : 'Reset your password'}
          </Text>
          <Text style={styles.body}>
            {mode === 'login'
              ? 'Sign in to load your splits, workouts, and progress.'
              : mode === 'signup'
                ? 'Create an account to keep your training data in sync.'
                : 'Enter your email and we will send a password reset link if the account exists.'}
          </Text>

          {(error || account.sessionError) && (
            <Text style={styles.error}>{error ?? account.sessionError}</Text>
          )}
          {message && <Text style={styles.success}>{message}</Text>}

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
          {mode !== 'forgot' && (
            <TextInput
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Password"
              placeholderTextColor={theme.textDim}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              style={styles.input}
            />
          )}

          <Pressable onPress={submit}>
            <Glass style={styles.primaryButton} interactive>
              <Text style={styles.primaryText}>
                {mode === 'login'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send reset link'}
              </Text>
            </Glass>
          </Pressable>

          {mode !== 'forgot' && (
            <View style={styles.socialSection}>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.divider} />
              </View>
              <Pressable
                accessibilityLabel="Continue with Google"
                accessibilityState={{ disabled: socialBusy !== null || !socialConfigured }}
                onPress={() => submitSocial('google')}
                disabled={socialBusy !== null || !socialConfigured}
                style={!socialConfigured ? styles.socialDisabled : undefined}
              >
                <Glass style={styles.socialButton} interactive>
                  {socialBusy === 'google' ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <View style={styles.socialButtonContent}>
                      <SocialProviderIcon provider="google" />
                      <Text style={styles.socialText}>Continue with Google</Text>
                    </View>
                  )}
                </Glass>
              </Pressable>
              {account.appleProviderEnabled && socialProviderVisible('apple') && (
                <Pressable
                  accessibilityLabel="Continue with Apple"
                  accessibilityState={{ disabled: socialBusy !== null || !socialConfigured }}
                  onPress={() => submitSocial('apple')}
                  disabled={socialBusy !== null || !socialConfigured}
                  style={!socialConfigured ? styles.socialDisabled : undefined}
                >
                  <Glass style={styles.socialButton} interactive>
                    {socialBusy === 'apple' ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <View style={styles.socialButtonContent}>
                        <SocialProviderIcon provider="apple" />
                        <Text style={styles.socialText}>Continue with Apple</Text>
                      </View>
                    )}
                  </Glass>
                </Pressable>
              )}
              {!socialConfigured && (
                <Text style={styles.socialConfigurationHint}>
                  Social sign-in is not configured for this build. Add the public Supabase URL and
                  publishable key, then restart or rebuild the app.
                </Text>
              )}
            </View>
          )}

          {mode === 'login' && (
            <Pressable
              onPress={() => {
                setMode('forgot');
                setError(null);
                setMessage(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.switchText}>Forgot password?</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setMode((current) => (current === 'signup' ? 'login' : current === 'login' ? 'signup' : 'login'));
              setError(null);
              setMessage(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.switchText}>
              {mode === 'login'
                ? 'Create an account'
                : mode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'Back to sign in'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setShowPrivacy(true)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.privacyText}>Privacy policy</Text>
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
  success: {
    color: theme.accent,
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
  socialSection: { marginTop: 18, gap: 9 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.13)' },
  dividerText: { color: theme.textDim, fontSize: 11 },
  socialButton: { borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  socialButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  socialDisabled: { opacity: 0.45 },
  socialText: { color: theme.text, fontSize: 14, fontWeight: '700' },
  socialConfigurationHint: {
    color: theme.textDim,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 2,
  },
  switchText: {
    color: theme.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  privacyText: {
    color: theme.textDim,
    fontSize: 11,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 18,
  },
});
