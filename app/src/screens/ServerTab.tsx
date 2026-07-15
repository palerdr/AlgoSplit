import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { buildWorkoutPayload } from '../api/sync';

// The generated client is loaded defensively: if it is absent or broken the
// tab degrades to an explanatory card instead of crashing the app.
/* eslint-disable @typescript-eslint/no-explicit-any */
let api: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  api = require('../api/backend');
} catch {
  api = null;
}
const auth = api?.auth;
const bodyweight = api?.bodyweight;
const customExercises = api?.customExercises;
const misc = api?.misc;
const workouts = api?.workouts;
const backendConfigured = (): boolean => api?.backendConfigured?.() === true;
/* eslint-enable @typescript-eslint/no-explicit-any */
import { useAppState } from '../state/AppState';
import { theme } from '../theme';
import Glass from '../ui/Glass';

const tick = () => Haptics.selectionAsync().catch(() => {});

type Status = 'unconfigured' | 'checking' | 'online' | 'offline';

export default function ServerTab() {
  const { lastCompleted, history } = useAppState();
  const clientReady = api !== null;
  const [status, setStatus] = useState<Status>(backendConfigured() ? 'checking' : 'unconfigured');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [weights, setWeights] = useState<{ label: string }[]>([]);
  const [customName, setCustomName] = useState('');

  const checkConnection = () => {
    if (!backendConfigured()) {
      setStatus('unconfigured');
      return;
    }
    setStatus('checking');
    misc
      .health()
      .then(() => setStatus('online'))
      .catch(() => setStatus('offline'));
  };

  const refreshAccount = () => {
    if (!backendConfigured()) return;
    auth
      .me()
      .then((me: { email?: string } | null | undefined) =>
        setUserEmail(me?.email ?? 'signed in')
      )
      .catch(() => setUserEmail(null));
  };

  useEffect(() => {
    checkConnection();
    refreshAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (label: string, fn: () => Promise<unknown>) => {
    tick();
    setBusy(true);
    setMessage(null);
    fn()
      .then(() => setMessage(`${label} ✓`))
      .catch((e: unknown) => setMessage(`${label} failed — ${e instanceof Error ? e.message : e}`))
      .finally(() => setBusy(false));
  };

  const statusText = {
    unconfigured: 'not configured',
    checking: 'checking…',
    online: 'online',
    offline: 'unreachable',
  }[status];

  return (
    <View>
      {/* Connection */}
      <Glass style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>AlgoSplit backend</Text>
          <Text
            style={[
              styles.status,
              status === 'online' && { color: theme.accent },
              status === 'offline' && { color: '#e07a5f' },
            ]}
          >
            {statusText}
          </Text>
        </View>
        <Text style={styles.hint}>
          {backendConfigured()
            ? 'Everything works offline on the local engine; connected features sync to the server.'
            : 'Set EXPO_PUBLIC_ALGOSPLIT_API (see .env.example) and restart to connect. Everything still works offline.'}
        </Text>
        {backendConfigured() && (
          <Pressable onPress={checkConnection}>
            <Glass style={styles.button} interactive>
              <Text style={styles.buttonText}>Test connection</Text>
            </Glass>
          </Pressable>
        )}
      </Glass>

      {clientReady && backendConfigured() && (
        <>
          {/* Account */}
          <Glass style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            {userEmail ? (
              <View>
                <Text style={styles.hint}>Signed in as {userEmail}</Text>
                <Pressable
                  onPress={() =>
                    run('Logout', async () => {
                      await auth.logout();
                      setUserEmail(null);
                    })
                  }
                >
                  <Glass style={styles.button} interactive>
                    <Text style={styles.buttonText}>Log out</Text>
                  </Glass>
                </Pressable>
              </View>
            ) : (
              <View>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email"
                  placeholderTextColor={theme.textDim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="password"
                  placeholderTextColor={theme.textDim}
                  secureTextEntry
                  style={styles.input}
                />
                <View style={styles.buttonRow}>
                  <Pressable
                    style={{ flex: 1 }}
                    disabled={busy}
                    onPress={() =>
                      run('Login', async () => {
                        await auth.login(email.trim(), password);
                        refreshAccount();
                      })
                    }
                  >
                    <Glass style={styles.button} interactive>
                      <Text style={styles.buttonText}>Log in</Text>
                    </Glass>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1 }}
                    disabled={busy}
                    onPress={() =>
                      run('Signup', async () => {
                        await auth.signup(email.trim(), password);
                        refreshAccount();
                      })
                    }
                  >
                    <Glass style={styles.button} interactive>
                      <Text style={styles.buttonText}>Sign up</Text>
                    </Glass>
                  </Pressable>
                </View>
              </View>
            )}
          </Glass>

          {/* Workout sync */}
          <Glass style={styles.card}>
            <Text style={styles.cardTitle}>Workout sync</Text>
            <Text style={styles.hint}>
              Finished workouts auto-push when connected. {history.length} local ·{' '}
              {lastCompleted ? `last: ${lastCompleted.name}` : 'none yet'}
            </Text>
            {lastCompleted && (
              <Pressable
                disabled={busy}
                onPress={() =>
                  run('Push last workout', () => workouts.create(buildWorkoutPayload(lastCompleted)))
                }
              >
                <Glass style={styles.button} interactive>
                  <Text style={styles.buttonText}>Push last workout</Text>
                </Glass>
              </Pressable>
            )}
          </Glass>

          {/* Bodyweight */}
          <Glass style={styles.card}>
            <Text style={styles.cardTitle}>Bodyweight</Text>
            <View style={styles.buttonRow}>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="lbs"
                placeholderTextColor={theme.textDim}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable
                disabled={busy || !weightInput}
                onPress={() =>
                  run('Log bodyweight', async () => {
                    await bodyweight.log(parseFloat(weightInput));
                    setWeightInput('');
                    const list: unknown[] = await bodyweight.list();
                    setWeights(
                      list
                        .slice(0, 5)
                        .map((w: unknown) => ({ label: JSON.stringify(w).slice(0, 60) }))
                    );
                  })
                }
              >
                <Glass style={styles.button} interactive>
                  <Text style={styles.buttonText}>Log</Text>
                </Glass>
              </Pressable>
            </View>
            {weights.map((w, i) => (
              <Text key={i} style={styles.hint} numberOfLines={1}>
                {w.label}
              </Text>
            ))}
          </Glass>

          {/* Custom exercises */}
          <Glass style={styles.card}>
            <Text style={styles.cardTitle}>Custom exercises</Text>
            <View style={styles.buttonRow}>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="exercise name"
                placeholderTextColor={theme.textDim}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable
                disabled={busy || !customName.trim()}
                onPress={() =>
                  run('Create exercise', async () => {
                    await customExercises.create({ name: customName.trim() });
                    setCustomName('');
                  })
                }
              >
                <Glass style={styles.button} interactive>
                  <Text style={styles.buttonText}>Add</Text>
                </Glass>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Server-matched via the backend pattern matcher; overrides, imports, comparisons,
              periodization and diagnostics are available through the same client
              (src/api/backend.ts — see FEATURE_COVERAGE.md).
            </Text>
          </Glass>
        </>
      )}

      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  input: {
    color: theme.text,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  message: {
    color: theme.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
});
