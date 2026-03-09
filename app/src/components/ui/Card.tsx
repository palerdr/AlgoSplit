import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, borders, spacing } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}

export function Card({ children, style, elevated = false }: CardProps) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borders.radius.xl,
    borderWidth: borders.width.thin,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderLight,
  },
});
