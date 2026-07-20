import * as Haptics from 'expo-haptics';

export const REST_COMPLETION_HAPTIC_GAP_MS = 110;

/** A success confirmation followed by one short pulse when rest reaches zero. */
export async function playRestCompletionHaptics(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await new Promise<void>((resolve) => setTimeout(resolve, REST_COMPLETION_HAPTIC_GAP_MS));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
