import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Modal } from './Modal';
import { colors, typography, spacing } from '../../theme';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
}

export function InfoModal({ visible, onClose, title, body }: InfoModalProps) {
  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <Text style={styles.body}>{body}</Text>
      <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
        <Text style={styles.dismissText}>Got it</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  dismissBtn: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderRadius: 8,
  },
  dismissText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '600',
  },
});
