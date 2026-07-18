import { createContext } from 'react';
import { Animated } from 'react-native';

export interface PopupGlassTransition {
  active: boolean;
  durationSeconds: number;
  progress: Animated.Value;
}

export const PopupGlassTransitionContext =
  createContext<PopupGlassTransition | null>(null);
