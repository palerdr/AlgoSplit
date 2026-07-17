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
// Unmounting is timer-driven, not callback-driven (see below) — this is
// slack on top of CLOSE_MS so a slow JS thread can't make the timer fire
// before the animation has actually finished painting.
const CLOSE_UNMOUNT_BUFFER_MS = 60;

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
 * Both layers derive from ONE shared `progress` value rather than two
 * independent ones — they can never drift apart and briefly show the cover
 * without the backdrop dimming it (or vice versa).
 *
 * Closing plays the reverse fade before actually unmounting, instead of the
 * popup just vanishing the instant `visible` goes false. Unmounting is
 * triggered by a fixed setTimeout, NOT the animation's own `.start(cb)`
 * callback: that callback fires on the JS thread and can lag a frame or
 * more behind the native-driven animation actually finishing, during which
 * the fully-opaque cover sits alone over an already-undimmed backdrop —
 * visible as a stray dark rounded rectangle ("black bar") right before it
 * finally unmounts.
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
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount immediately so the reveal animation below has a real view to
  // animate — starting it in the same tick as setMounted risks animating
  // toward a view that hasn't committed yet.
  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!visible || !mounted) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [mounted, visible, progress]);

  useEffect(() => {
    if (visible || !mounted) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setMounted(false);
    }, CLOSE_MS + CLOSE_UNMOUNT_BUFFER_MS);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [visible, mounted, progress]);

  if (!mounted) return null;

  const backdropOpacity = progress;
  const coverOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

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
