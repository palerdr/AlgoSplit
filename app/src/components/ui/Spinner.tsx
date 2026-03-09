import React from 'react';
import { ActivityIndicator, View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme';

interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export function Spinner({
  size = 'large',
  color = colors.green,
  fullScreen = false,
  style,
}: SpinnerProps) {
  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, style]}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return <ActivityIndicator size={size} color={color} style={style} />;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});
