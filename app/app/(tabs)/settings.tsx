import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { Card, Modal, Spinner } from '../../src/components/ui';
import { colors, borders, spacing, typography } from '../../src/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      setIsLoggingOut(true);
      await logout();
    } catch {
      Alert.alert('Error', 'Failed to log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Account, units, and analysis defaults.</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="person-outline" size={18} color={colors.green} />
          </View>
          <View style={styles.meta}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value}>{user?.email ?? 'Unknown account'}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.meta}>
            <Text style={styles.sectionTitle}>Units</Text>
            <Text style={styles.sectionHint}>Global unit preferences will live here next.</Text>
          </View>
          <Text style={styles.comingSoon}>Soon</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.meta}>
            <Text style={styles.sectionTitle}>Analysis</Text>
            <Text style={styles.sectionHint}>Default analysis settings will move here.</Text>
          </View>
          <Text style={styles.comingSoon}>Soon</Text>
        </View>
      </Card>

      <TouchableOpacity
        style={[styles.logoutButton, (isLoading || isLoggingOut) && styles.logoutButtonDisabled]}
        onPress={handleLogout}
        disabled={isLoading || isLoggingOut}
      >
        {isLoading || isLoggingOut ? (
          <Spinner />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color={colors.red} />
            <Text style={styles.logoutText}>Log Out</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Log Out"
      >
        <Text style={styles.confirmBody}>
          This will clear your current session on this device.
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={styles.confirmSecondary}
            onPress={() => setShowLogoutConfirm(false)}
          >
            <Text style={styles.confirmSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmPrimary}
            onPress={confirmLogout}
          >
            <Text style={styles.confirmPrimaryText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
  },
  meta: {
    flex: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  value: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  comingSoon: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.red,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: borders.radius.lg,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
