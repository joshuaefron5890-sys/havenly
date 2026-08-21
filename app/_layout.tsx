import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { AuthProvider } from '../contexts/AuthContext';
import { MessagesProvider } from '../contexts/MessagesContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { configureForegroundNotificationHandler, subscribeToNotificationTaps } from '../lib/pushNotifications';
import { colors } from '../theme/colors';

export default function RootLayout() {
  // Root-level (not per-tab) since a tap should navigate correctly no
  // matter which screen the app happens to already be on. The server
  // includes { url: '/proposal/xyz' } / { url: '/messages/xyz' } on every
  // push it sends (see functions/index.js) — router.push handles that
  // exact path format directly, no parsing needed.
  useEffect(() => {
    configureForegroundNotificationHandler();
    let unsubscribe: (() => void) | undefined;
    subscribeToNotificationTaps((url) => router.push(url as any)).then((unsub) => {
      unsubscribe = unsub;
    });
    return () => unsubscribe?.();
  }, []);

  return (
    <AuthProvider>
      <MessagesProvider>
        <OnboardingProvider>
          <SafeAreaProvider>
            <ResponsiveContainer>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="profile" />
                {/* No legitimate "back" from the tab root — an edge swipe
                    here would otherwise try to pop toward sign-in/landing
                    while still signed in, leaving the app in a broken
                    in-between state. */}
                <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
              </Stack>
            </ResponsiveContainer>
          </SafeAreaProvider>
        </OnboardingProvider>
      </MessagesProvider>
    </AuthProvider>
  );
}
