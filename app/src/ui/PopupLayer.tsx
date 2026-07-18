import React, {
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { liquidGlassAvailable } from './GlassRuntime';
import { PopupGlassTransitionContext } from './PopupGlassTransition';

interface PopupLayerProps {
  visible: boolean;
  onDismiss: () => void;
  accessibilityLabel: string;
  /** Disables backdrop-tap-to-dismiss, e.g. while a destructive action is in flight. */
  dismissDisabled?: boolean;
  maxWidth?: number;
  /** Matches the child card and keeps the animated frame's bounds consistent. */
  cardRadius?: number;
  children: ReactNode;
}

const OPEN_MS = 220;
const CLOSE_MS = 140;

/**
 * Shared entrance/exit for glass popups (confirm dialogs, pickers). Native
 * Liquid Glass stays in-tree because a separate window cannot sample the
 * screen behind it. BlurView fallbacks can use a native Modal, which restores
 * platform modal accessibility without compromising the glass material.
 *
 * The previous implementation faked a fade by animating an opaque
 * `theme.bg` cover over it. At the first and last frames that cover was a
 * literal dark rectangle over an almost-transparent backdrop — the reported
 * black-square flash.
 *
 * Native Liquid Glass now stays at full opacity, animates its own material,
 * and uses only a short settle transform while the plain backdrop fades.
 * Every BlurView fallback can use a normal alpha transition. Liquid Glass is
 * never under an opacity-animated ancestor, so there is no masking rectangle
 * or stale timer frame.
 */
export default function PopupLayer({
  visible,
  onDismiss,
  accessibilityLabel,
  dismissDisabled = false,
  maxWidth = 420,
  cardRadius = 22,
  children,
}: PopupLayerProps) {
  const [mounted, setMounted] = useState(visible);
  const [glassActive, setGlassActive] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const transitionRef = useRef(0);
  const visibleRef = useRef(visible);
  const onDismissRef = useRef(onDismiss);
  const dismissDisabledRef = useRef(dismissDisabled);
  const layerRef = useRef<View>(null);
  const frameRef = useRef<View>(null);
  const focusTargetRef = useRef<View>(null);
  visibleRef.current = visible;
  onDismissRef.current = onDismiss;
  dismissDisabledRef.current = dismissDisabled;

  useEffect(() => {
    animationRef.current?.stop();
    const transition = ++transitionRef.current;

    if (visible && !mounted) {
      setMounted(true);
      return;
    }
    if (!mounted) return;

    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? OPEN_MS : CLOSE_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
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
      }
    });

    return () => {
      animation.stop();
      if (animationRef.current === animation) animationRef.current = null;
    };
  }, [mounted, progress, visible]);

  useEffect(() => {
    if (!mounted || !visible) {
      setGlassActive(false);
      return;
    }
    const frame = requestAnimationFrame(() => setGlassActive(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted, visible]);

  useEffect(() => {
    if (!mounted || !visible || Platform.OS === 'web') return;
    const focusTimer = setTimeout(() => {
      if (!visibleRef.current) return;
      if (Platform.OS === 'android') {
        AccessibilityInfo.announceForAccessibility(accessibilityLabel);
        return;
      }
      const node = findNodeHandle(focusTargetRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, Platform.OS === 'ios' ? 50 : 0);
    return () => clearTimeout(focusTimer);
  }, [accessibilityLabel, mounted, visible]);

  // RN Modal normally provides this behavior. Because glass popups stay in
  // the existing native view hierarchy, reproduce its Escape + focus trap on
  // web so keyboard focus cannot leak to the screen behind the dialog.
  useEffect(() => {
    if (!mounted || Platform.OS !== 'web') return;
    const documentRef = globalThis.document;
    const layer = layerRef.current as unknown as HTMLElement | null;
    if (!documentRef || !layer) return;

    const previouslyFocused = documentRef.activeElement as HTMLElement | null;
    const focusableElements = () =>
      Array.from(
        layer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
            'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) =>
          !element.closest('[aria-hidden="true"]') &&
          element.getAttribute('tabindex') !== '-1' &&
          element.getClientRects().length > 0
      );

    const focusTimer = setTimeout(() => {
      (focusableElements()[0] ?? layer).focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visibleRef.current) {
        event.preventDefault();
        layer.focus();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (visibleRef.current && !dismissDisabledRef.current) onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        layer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    documentRef.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      documentRef.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted || Platform.OS !== 'web') return;
    const layer = layerRef.current as unknown as HTMLElement | null;
    const frame = frameRef.current as unknown as HTMLElement | null;
    if (!layer || !frame) return;
    if (visible) {
      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('inert');
    } else {
      // Move focus before hiding the subtree; Chromium otherwise rejects
      // aria-hidden on a focused descendant and leaves its actions active.
      layer.focus();
      frame.setAttribute('inert', '');
      frame.setAttribute('aria-hidden', 'true');
    }
    return () => {
      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('inert');
    };
  }, [mounted, visible]);

  const glassTransition = useMemo(
    () => ({
      active: glassActive && visible,
      durationSeconds: (visible ? OPEN_MS : CLOSE_MS) / 1000,
      progress,
    }),
    [glassActive, progress, visible]
  );

  if (!mounted) return null;

  const frameMotion = {
    // Every BlurView fallback can use an ordinary alpha transition. Native
    // Liquid Glass stays fully opaque and animates its material via context.
    ...(!liquidGlassAvailable ? { opacity: progress } : null),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
    ],
  };

  const layer = (
    <View
      ref={layerRef}
      style={styles.layer}
      role="dialog"
      aria-modal
      tabIndex={-1}
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal
      onAccessibilityEscape={() => {
        if (!dismissDisabledRef.current) onDismissRef.current();
      }}
    >
      {Platform.OS !== 'web' && (
        <View
          ref={focusTargetRef}
          accessible
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel}
          pointerEvents="none"
          style={styles.accessibilityFocusTarget}
        />
      )}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: progress }]}
      >
        <Pressable
          accessible={false}
          focusable={false}
          tabIndex={-1}
          aria-hidden
          style={StyleSheet.absoluteFillObject}
          onPress={!visible || dismissDisabled ? undefined : onDismiss}
          disabled={!visible || dismissDisabled}
        />
      </Animated.View>
      <Animated.View
        ref={frameRef}
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        style={[styles.frame, { maxWidth, borderRadius: cardRadius }, frameMotion]}
      >
        <PopupGlassTransitionContext.Provider value={glassTransition}>
          {children}
        </PopupGlassTransitionContext.Provider>
      </Animated.View>
    </View>
  );

  if (Platform.OS !== 'web' && !liquidGlassAvailable) {
    return (
      <Modal
        visible={mounted}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          if (visibleRef.current && !dismissDisabledRef.current) onDismissRef.current();
        }}
      >
        {layer}
      </Modal>
    );
  }

  return layer;
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
  accessibilityFocusTarget: {
    position: 'absolute',
    width: 1,
    height: 1,
    top: 1,
    left: 1,
  },
  frame: {
    width: '100%',
  },
});
