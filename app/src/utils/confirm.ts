import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog.
 * On web: uses window.confirm (Alert.alert callbacks are unreliable on Expo Web).
 * On native: uses Alert.alert with cancel/confirm buttons.
 */
export function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
