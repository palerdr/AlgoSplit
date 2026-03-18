import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import * as authApi from '../../src/api/auth.api';
import { tokenStore } from '../../src/api/client';
import { Card, Modal, Spinner } from '../../src/components/ui';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { colors, borders, spacing, typography } from '../../src/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const stimulusDuration = useSettingsStore((s) => s.stimulusDuration);
  const maintenanceVolume = useSettingsStore((s) => s.maintenanceVolume);
  const dataset = useSettingsStore((s) => s.dataset);
  const setWeightUnit = useSettingsStore((s) => s.setWeightUnit);
  const setStimulusDuration = useSettingsStore((s) => s.setStimulusDuration);
  const setMaintenanceVolume = useSettingsStore((s) => s.setMaintenanceVolume);
  const setDataset = useSettingsStore((s) => s.setDataset);

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

  const confirmDeleteAccount = async () => {
    try {
      setShowDeleteConfirm(false);
      setIsDeleting(true);
      await authApi.deleteAccount();
      await tokenStore.clearToken();
      await logout();
    } catch {
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Account, units, and analysis defaults.</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Weight Unit</Text>
            <Text style={styles.sectionHint}>Affects how weights display throughout the app.</Text>
          </View>
          <View style={styles.segmented}>
            {(['lb', 'kg'] as const).map((unit) => {
              const active = unit === weightUnit;
              return (
                <TouchableOpacity
                  key={unit}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setWeightUnit(unit)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {unit}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Analysis Defaults</Text>
            <Text style={styles.sectionHint}>These settings drive the dashboard’s live stimulus scoring.</Text>
          </View>

          <View style={styles.controlBlock}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlTitle}>Stimulus Duration</Text>
              <Text style={styles.controlValue}>{stimulusDuration}h</Text>
            </View>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setStimulusDuration(stimulusDuration - 12)}
              >
                <Text style={styles.stepperButtonText}>-12</Text>
              </TouchableOpacity>
              <View style={styles.stepperTrack}>
                <View style={[styles.stepperFill, { width: `${((stimulusDuration - 24) / 72) * 100}%` }]} />
              </View>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setStimulusDuration(stimulusDuration + 12)}
              >
                <Text style={styles.stepperButtonText}>+12</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.controlHint}>How long muscle protein synthesis stays elevated after training.</Text>
          </View>

          <View style={styles.controlBlock}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlTitle}>Maintenance Volume</Text>
              <Text style={styles.controlValue}>{maintenanceVolume} sets</Text>
            </View>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setMaintenanceVolume(maintenanceVolume - 1)}
              >
                <Text style={styles.stepperButtonText}>-</Text>
              </TouchableOpacity>
              <View style={styles.maintenanceTrack}>
                {Array.from({ length: 9 }, (_, index) => {
                  const active = index < maintenanceVolume;
                  return (
                    <View
                      key={index}
                      style={[styles.maintenanceBar, active && styles.maintenanceBarActive]}
                    />
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setMaintenanceVolume(maintenanceVolume + 1)}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.controlHint}>Sets needed to avoid drifting into atrophy debt.</Text>
          </View>

          <View style={styles.controlBlock}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlTitle}>Fatigue Curve</Text>
            </View>
            <View style={styles.segmented}>
              {([
                ['schoenfeld', 'Schoenfeld'],
                ['pelland', 'Pelland'],
                ['average', 'Average'],
              ] as const).map(([value, label]) => {
                const active = dataset === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => setDataset(value)}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.controlHint}>Chooses the diminishing-returns model used during analysis.</Text>
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

        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.logoutButtonDisabled]}
          onPress={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Spinner />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={colors.red} />
              <Text style={styles.logoutText}>Delete Account</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

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

      <Modal
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Account"
      >
        <Text style={styles.confirmBody}>
          This will permanently delete your account and all your data (splits, workouts, exercises). This cannot be undone.
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={styles.confirmSecondary}
            onPress={() => setShowDeleteConfirm(false)}
          >
            <Text style={styles.confirmSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmPrimary}
            onPress={confirmDeleteAccount}
          >
            <Text style={styles.confirmPrimaryText}>Delete Account</Text>
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
  scrollContent: {
    paddingBottom: spacing['2xl'],
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
  sectionHeader: {
    marginBottom: 14,
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
  segmented: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.greenMuted,
    borderColor: colors.green,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.green,
  },
  controlBlock: {
    marginBottom: 18,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  controlTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  controlValue: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  controlHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperButton: {
    width: 52,
    minHeight: 40,
    borderRadius: borders.radius.lg,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepperTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  stepperFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  maintenanceTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  maintenanceBar: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  maintenanceBarActive: {
    backgroundColor: colors.green,
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
  deleteButton: {
    marginTop: spacing.md,
    minHeight: 52,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
