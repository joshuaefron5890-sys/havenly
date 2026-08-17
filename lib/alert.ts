import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert() is a hard no-op (see
// node_modules/react-native-web/src/exports/Alert — `static alert() {}`),
// so every Alert.alert() call in this app was silently swallowed on web,
// the only platform this app currently ships to. A failure looked
// identical to nothing happening at all, with zero indication anything
// went wrong. Falls back to the browser's built-in alert on web; native
// platforms get the real Alert.alert.
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
