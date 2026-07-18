import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../theme';
import Glass from './Glass';

let SymbolView: React.ComponentType<any> | null = null;
try {
  // Native SF Symbols on Apple platforms, with a simple text fallback elsewhere.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SymbolView = require('expo-symbols').SymbolView;
} catch {
  SymbolView = null;
}

interface StatusHudProps {
  kind: 'loading' | 'error';
  label: string;
  onPress?: () => void;
}

export default function StatusHud({ kind, label, onPress }: StatusHudProps) {
  const content = (
    <Glass
      style={[styles.capsule, kind === 'error' && styles.errorCapsule]}
      tintColor={kind === 'error' ? 'rgba(92,20,20,0.12)' : 'rgba(255,255,255,0.025)'}
      interactive={Boolean(onPress)}
    >
      <View pointerEvents="none" style={styles.content}>
        {kind === 'loading' ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : SymbolView ? (
          <SymbolView
            name="exclamationmark.circle.fill"
            size={17}
            tintColor="#E27878"
          />
        ) : (
          <Text style={styles.errorFallback}>!</Text>
        )}
        <Text style={[styles.label, kind === 'error' && styles.errorLabel]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Glass>
  );

  return (
    <View
      pointerEvents={onPress ? 'box-none' : 'none'}
      style={styles.layer}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}. Retry.`}
          accessibilityHint="Retries the failed sync"
          hitSlop={10}
          onPress={onPress}
        >
          {content}
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={label}
        >
          {content}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: {
    minHeight: 40,
    maxWidth: 230,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 13,
    justifyContent: 'center',
  },
  errorCapsule: {
    borderColor: 'rgba(226,120,120,0.34)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: theme.textDim,
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
  },
  errorLabel: {
    color: '#E8A0A0',
  },
  errorFallback: {
    color: '#E27878',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center',
    width: 17,
  },
});
