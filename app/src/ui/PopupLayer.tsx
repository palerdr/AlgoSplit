import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import FadeIn from './FadeIn';

interface PopupLayerProps {
  visible: boolean;
  onDismiss: () => void;
  /** Disables backdrop-tap-to-dismiss, e.g. while a destructive action is in flight. */
  dismissDisabled?: boolean;
  maxWidth?: number;
  children: ReactNode;
}

/**
 * Shared entrance for in-tree glass popups (confirm dialogs, pickers).
 * Rendered in-tree rather than via RN's Modal — a separate native window
 * can't sample the screen behind it, so GlassView loses the liquid-glass
 * look inside an RN Modal.
 *
 * Only the backdrop fades via opacity. The card settles in via transform
 * (FadeIn) instead, because opacity-animating an ancestor of GlassView
 * breaks the glass effect, sometimes permanently, on iOS.
 */
export default function PopupLayer({
  visible,
  onDismiss,
  dismissDisabled = false,
  maxWidth = 420,
  children,
}: PopupLayerProps) {
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    backdropOpacity.setValue(0);
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, backdropOpacity]);

  if (!visible) return null;

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
      <FadeIn style={[styles.frame, { maxWidth }]}>{children}</FadeIn>
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
});
