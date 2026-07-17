import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface TooltipProps {
  visible: boolean;
  text: string;
  /** Which edge of the bubble the caret sits on, pointing back at the anchor. */
  pointer?: 'top' | 'bottom';
  /** Distance in px from the bubble's left edge to the caret's center. Omit to center it under the bubble. */
  caretOffset?: number;
  maxWidth?: number;
  /** Positions the whole tooltip (top/left/right, etc.) — the anchor decides where it sits. */
  style?: StyleProp<ViewStyle>;
}

const BUBBLE_BG = 'rgba(20,20,20,0.96)';
const CARET_HALF = 6;
const FADE_MS = 160;

/** A proper speech-bubble tooltip — pointed caret, fades in and out (never just vanishes). */
export default function Tooltip({
  visible,
  text,
  pointer = 'top',
  caretOffset,
  maxWidth = 160,
  style,
}: TooltipProps) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!mounted) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const caretStyle =
    caretOffset !== undefined
      ? {
          position: 'absolute' as const,
          left: caretOffset - CARET_HALF,
          [pointer === 'top' ? 'top' : 'bottom']: 0,
        }
      : undefined;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style, { opacity, maxWidth }]}>
      {pointer === 'top' && <View style={[styles.caretUp, caretStyle]} />}
      <View style={styles.bubble}>
        <Text style={styles.text}>{text}</Text>
      </View>
      {pointer === 'bottom' && <View style={[styles.caretDown, caretStyle]} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  bubble: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: BUBBLE_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  text: {
    color: theme.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  caretUp: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BUBBLE_BG,
  },
  caretDown: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BUBBLE_BG,
  },
});
