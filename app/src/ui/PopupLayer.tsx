import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

interface PopupLayerProps {
  visible: boolean;
  onDismiss: () => void;
  /** Disables backdrop-tap-to-dismiss, e.g. while a destructive action is in flight. */
  dismissDisabled?: boolean;
  maxWidth?: number;
  /** Must match the child Glass card's own borderRadius for the cover-fade below to line up cleanly. */
  cardRadius?: number;
  children: ReactNode;
}

const OPEN_MS = 220;
const CLOSE_MS = 140;

/**
 * Shared entrance/exit for in-tree glass popups (confirm dialogs, pickers).
 * Rendered in-tree rather than via RN's Modal — a separate native window
 * can't sample the screen behind it, so GlassView loses the liquid-glass
 * look inside an RN Modal.
 *
 * A PURE FADE, no slide/scale — and animated on both open and close. Two
 * layers do the animating, neither of which is ever an ancestor of the
 * Glass card, because opacity-animating an ancestor of GlassView breaks the
 * glass effect, sometimes permanently, on iOS:
 *  - the backdrop (a plain dim scrim, no glass descendant — safe to fade
 *    directly)
 *  - an opaque "cover" drawn as a SIBLING on top of the already-fully-
 *    rendered Glass card, matching its rounded rect. It starts fully opaque
 *    (hiding the card) and fades to transparent (revealing it) on open, and
 *    reverses on close — the viewer sees the card itself fade, without the
 *    card's own opacity ever changing.
 *
 * Closing plays the reverse fade before actually unmounting, instead of the
 * popup just vanishing the instant `visible` goes false.
 */
export default function PopupLayer({
  visible,
  onDismiss,
  dismissDisabled = false,
  maxWidth = 420,
  cardRadius = 22,
  children,
}: PopupLayerProps) {
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const coverOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdropOpacity.setValue(0);
      coverOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: OPEN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(coverOpacity, {
          toValue: 0,
          duration: OPEN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(coverOpacity, {
        toValue: 1,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFillObject}
          onPress={dismissDisabled ? undefined : onDismiss}
          disabled={dismissDisabled}
        />
      </Animated.View>
      <View style={[styles.frame, { maxWidth, borderRadius: cardRadius }]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.cover,
            { borderRadius: cardRadius, opacity: coverOpacity },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frame: {
    width: '100%',
  },
  cover: {
    backgroundColor: theme.bg,
  },
});
