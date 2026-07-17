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
import { authErrorMessageForDisplay } from '../api/backend';
import { theme } from '../theme';
import FadeIn from '../ui/FadeIn';
import Glass from '../ui/Glass';

interface ResetPasswordScreenProps {
  token: string;
  onDone: () => void;
}

export default function ResetPasswordScreen({ token, onDone }: ResetPasswordScreenProps) {
  const account = useAccountState();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await account.resetPassword(token, password);
      setComplete(true);
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(
        authErrorMessageForDisplay(cause, 'The reset link is invalid or expired.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FadeIn style={styles.cardWrap}>
        <Glass style={styles.card}>
          <Text style={styles.brand}>AlgoSplit</Text>
          <Text style={styles.title}>{complete ? 'Password updated' : 'Choose a new password'}</Text>
          <Text style={styles.body}>
            {complete
              ? 'You can now sign in with your new password.'
              : 'Your new password must be at least 8 characters.'}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {!complete && (
            <>
              <TextInput
                accessibilityLabel="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={theme.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Confirm new password"
                value={confirmation}
                onChangeText={setConfirmation}
                onSubmitEditing={submit}
                placeholder="Confirm new password"
                placeholderTextColor={theme.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.input}
              />
            </>
          )}
          <Pressable onPress={complete ? onDone : submit} disabled={loading}>
            <Glass style={styles.button} interactive>
              {loading ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Text style={styles.buttonText}>{complete ? 'Go to sign in' : 'Reset password'}</Text>
              )}
            </Glass>
          </Pressable>
          {!complete && (
            <Pressable onPress={onDone} hitSlop={8}>
              <Text style={styles.cancel}>Back to sign in</Text>
            </Pressable>
          )}
        </Glass>
      </FadeIn>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // FadeIn needs a concrete width — see AuthScreen.cardWrap.
  cardWrap: { width: '100%', maxWidth: 420 },
  card: { width: '100%', borderRadius: 28, padding: 24 },
  brand: { color: theme.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 24 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  body: { color: theme.textDim, fontSize: 13, lineHeight: 19, marginBottom: 22 },
  error: { color: '#E27878', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  input: { color: theme.text, backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.14)', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 11 },
  button: { borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 5 },
  buttonText: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  cancel: { color: theme.textDim, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
