import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InfoModal } from './InfoModal';
import { colors } from '../../theme';

interface InfoButtonProps {
  title: string;
  body: string;
  size?: number;
}

export function InfoButton({ title, body, size = 16 }: InfoButtonProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        hitSlop={8}
        style={styles.button}
      >
        <Ionicons name="help-circle-outline" size={size} color={colors.textMuted} />
      </TouchableOpacity>
      <InfoModal
        visible={visible}
        onClose={() => setVisible(false)}
        title={title}
        body={body}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 2,
  },
});
