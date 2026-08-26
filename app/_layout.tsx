import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { AuthProvider } from '../contexts/AuthContext';
import { MessagesProvider } from '../contexts/MessagesContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { getFatalErrorText, subscribeFatalError } from '../lib/crashDiagnostics';
import { configureForegroundNotificationHandler, subscribeToNotificationTaps } from '../lib/pushNotifications';
import { colors } from '../theme/colors';

export default function RootLayout() {
  // The actual handler is installed in index.js, before this file (or
  // anything it imports) ever runs — see lib/crashDiagnostics.ts. This
  // just displays whatever it caught. TEMPORARY, remove once the current
  // TestFlight crash is diagnosed.
  const [errorText, setErrorText] = useState<string | null>(getFatalErrorText());

  useEffect(() => {
    subscribeFatalError(setErrorText);
    return () => subscribeFatalError(null);
  }, []);

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

  if (errorText) {
    return (
      <SafeAreaProvider>
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
          <RNText selectable style={{ fontWeight: '700', fontSize: 16, marginBottom: 12, color: '#000' }}>
            Caught a fatal error — screenshot or copy this and send it over:
          </RNText>
          <RNText selectable style={{ fontFamily: 'Courier', fontSize: 12, color: '#000' }}>
            {errorText}
          </RNText>
        </ScrollView>
      </SafeAreaProvider>
    );
  }

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
                <Stack.Screen name="(sitter)" options={{ gestureEnabled: false }} />
              </Stack>
            </ResponsiveContainer>
          </SafeAreaProvider>
        </OnboardingProvider>
      </MessagesProvider>
    </AuthProvider>
  );
}
