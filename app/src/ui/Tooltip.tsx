import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface TooltipProps {
  visible: boolean;
  /** Plain copy for the common case. Use children for richer chart callouts. */
  text?: string;
  children?: ReactNode;
  /** Which edge of the bubble the caret sits on, pointing back at the anchor. */
  pointer?: 'top' | 'bottom';
  /** Distance in px from the bubble's left edge to the caret's center. Omit to center it under the bubble. */
  caretOffset?: number;
  maxWidth?: number;
  bubbleStyle?: StyleProp<ViewStyle>;
  /** Called only after a completed fade-out. Useful for swapping anchored content cleanly. */
  onHidden?: () => void;
  /** Positions the whole tooltip (top/left/right, etc.) — the anchor decides where it sits. */
  style?: StyleProp<ViewStyle>;
}

const BUBBLE_BG = 'rgba(30,30,30,0.98)';
const CARET_HALF = 5;
const FADE_MS = 160;

/** A proper speech-bubble tooltip — pointed caret, fades in and out (never just vanishes). */
export default function Tooltip({
  visible,
  text,
  pointer = 'top',
  caretOffset,
  maxWidth = 160,
  bubbleStyle,
  onHidden,
  style,
  children,
}: TooltipProps) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const transitionRef = useRef(0);
  const visibleRef = useRef(visible);
  const onHiddenRef = useRef(onHidden);
  visibleRef.current = visible;
  onHiddenRef.current = onHidden;

  useEffect(() => {
    animationRef.current?.stop();
    const transition = ++transitionRef.current;

    if (visible && !mounted) {
      setMounted(true);
      return;
    }
    if (!mounted) return;

    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: FADE_MS,
      easing: visible ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (animationRef.current === animation) animationRef.current = null;
      if (
        finished &&
        transitionRef.current === transition &&
        !visibleRef.current
      ) {
        setMounted(false);
        onHiddenRef.current?.();
      }
    });

    return () => {
      animation.stop();
      if (animationRef.current === animation) animationRef.current = null;
    };
  }, [mounted, opacity, visible]);

  if (!mounted) return null;

  const caretStyle =
    caretOffset !== undefined
      ? {
          alignSelf: 'flex-start' as const,
          marginLeft: Math.max(0, caretOffset - CARET_HALF),
        }
      : undefined;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style, { opacity, maxWidth }]}>
      {pointer === 'top' && <View style={[styles.caretUp, caretStyle]} />}
      <View style={[styles.bubble, bubbleStyle]}>
        {children ?? <Text style={styles.text}>{text}</Text>}
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
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: BUBBLE_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    color: theme.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  caretUp: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BUBBLE_BG,
    marginBottom: -1,
    zIndex: 1,
  },
  caretDown: {
    width: 0,
    height: 0,
    borderLeftWidth: CARET_HALF,
    borderRightWidth: CARET_HALF,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BUBBLE_BG,
    marginTop: -1,
    zIndex: 1,
  },
});
