import Constants from 'expo-constants';
import { doc, arrayRemove, arrayUnion, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';

// Registered per signed-in PERSON (auth uid), not per family — an invited
// family member (see lib/familyMembers.ts) has their own device/token
// even though their data lives under the family's shared uid, and
// functions/index.js's pushTokensForFamily fans out to everyone's tokens
// individually for exactly that reason.
async function savePushToken(uid: string, token: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'pushTokens', uid), { tokens: arrayUnion(token) }, { merge: true });
}

export async function removePushToken(uid: string, token: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'pushTokens', uid), { tokens: arrayRemove(token) }, { merge: true });
}

// Web has no meaningful equivalent here (a real web-push setup needs its
// own VAPID keys and service worker, a separate project) — this whole
// flow is native-only, same scoping as photoUploadSupported/native photo
// picking elsewhere in the app.
export function pushNotificationsSupported(): boolean {
  return Platform.OS !== 'web';
}

// Requests permission (a no-op if already granted/denied), gets this
// device's Expo push token, and saves it against the signed-in person's
// own uid. Best-effort throughout — a failure here (permission denied, no
// physical device, offline) shouldn't block anything else in the app, so
// this never throws; it just resolves null.
export async function registerForPushNotificationsAsync(uid: string): Promise<string | null> {
  if (!pushNotificationsSupported()) return null;
  try {
    // Both imported dynamically — expo-notifications touches native APIs
    // at module load on some platforms, which is fine on-device but not
    // worth pulling into the web bundle at all given pushNotificationsSupported's
    // early return above already excludes web from ever reaching here.
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!Device.isDevice) {
      // Simulators/emulators can't receive real pushes.
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await savePushToken(uid, token);
    return token;
  } catch {
    return null;
  }
}

// Shows a banner/plays a sound even while the app is already open —
// without this, expo-notifications' default handler suppresses foreground
// notifications entirely, which would make a message that arrives while
// you're already in the app look like it silently never notified you.
export async function configureForegroundNotificationHandler(): Promise<void> {
  if (!pushNotificationsSupported()) return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Wires a tap on a delivered notification to actually navigate somewhere —
// the server includes { url: '/proposal/xyz' } / { url: '/messages/xyz' }
// in each push's data payload (see functions/index.js's sendExpoPush
// callers), matched here to expo-router's own path format. Returns an
// unsubscribe function; call once near the app root.
export async function subscribeToNotificationTaps(onUrl: (url: string) => void): Promise<() => void> {
  if (!pushNotificationsSupported()) return () => {};
  const Notifications = await import('expo-notifications');
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string') onUrl(url);
  });
  return () => subscription.remove();
}
