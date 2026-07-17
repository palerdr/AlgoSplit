import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../theme';
import Glass from './Glass';

interface DeleteConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** A single, predictable confirmation surface for destructive account actions. */
export default function DeleteConfirmationModal({
  visible,
  title,
  message,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  const cancel = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancel}
    >
      <View style={styles.layer} accessibilityViewIsModal>
        <Pressable
          accessible={false}
          style={styles.backdrop}
          onPress={cancel}
          disabled={busy}
        />
        <View accessible accessibilityRole="alert" style={styles.frame}>
          <Glass style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={cancel}
                disabled={busy}
                hitSlop={8}
                style={styles.actionButton}
              >
                <Text style={[styles.cancel, busy && styles.disabled]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Deleting' : 'Confirm delete'}
                onPress={onConfirm}
                disabled={busy}
                hitSlop={8}
                style={styles.actionButton}
              >
                <Text style={[styles.confirm, busy && styles.disabled]}>
                  {busy ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  frame: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    borderRadius: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    color: theme.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  error: {
    color: '#E27878',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 24,
    marginTop: 20,
  },
  actionButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  cancel: {
    color: theme.textDim,
    fontSize: 14,
    fontWeight: '700',
  },
  confirm: {
    color: '#E27878',
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: { opacity: 0.4 },
});
