import * as Haptics from 'expo-haptics';

export const REST_COMPLETION_HAPTIC_GAP_MS = 110;

/** A short, deliberate double pulse when a rest naturally reaches zero. */
export async function playRestCompletionHaptics(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  await new Promise<void>((resolve) => setTimeout(resolve, REST_COMPLETION_HAPTIC_GAP_MS));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
