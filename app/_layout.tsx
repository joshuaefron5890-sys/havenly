import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { Component, ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { AuthProvider } from '../contexts/AuthContext';
import { MessagesProvider } from '../contexts/MessagesContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { getFatalErrorText, subscribeFatalError } from '../lib/crashDiagnostics';
import { configureForegroundNotificationHandler, subscribeToNotificationTaps } from '../lib/pushNotifications';
import { colors } from '../theme/colors';
import { FONT_FILES } from '../theme/typography';

// TEMPORARY diagnostic UI — see lib/crashDiagnostics.ts. Shared by both
// paths that can produce an error to display: state pushed from outside
// React (NativeExceptionsManager/console.error/ErrorUtils, captured
// async) and FatalErrorBoundary below (a render-time throw, caught by
// React itself). Remove alongside crashDiagnostics.ts once the real bug
// is found and fixed.
function ErrorScreen({ text }: { text: string }) {
  return (
    <SafeAreaProvider>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <RNText selectable style={{ fontWeight: '700', fontSize: 16, marginBottom: 12, color: '#000' }}>
          Caught a fatal error — screenshot or copy this and send it over:
        </RNText>
        <RNText selectable style={{ fontFamily: 'Courier', fontSize: 12, color: '#000' }}>
          {text}
        </RNText>
      </ScrollView>
    </SafeAreaProvider>
  );
}

// A render-time throw (as opposed to one from an async callback or native
// module) unmounts the whole tree by default in React when nothing above
// it catches it — including the state-based error display in RootLayout
// below, since that lives INSIDE the same tree that just got unmounted.
// That's exactly what a blank white screen after installFatalErrorDisplay
// stopped the app from hard-crashing turned out to mean: the native crash
// was prevented, but nothing was left mounted to show why. This boundary
// sits above everything else specifically to catch that case too.
class FatalErrorBoundary extends Component<{ children: ReactNode }, { errorText: string | null }> {
  state: { errorText: string | null } = { errorText: null };

  static getDerivedStateFromError(error: Error) {
    return { errorText: `[render] ${error?.message ?? String(error)}\n\n${error?.stack ?? '(no stack)'}` };
  }

  render() {
    if (this.state.errorText) {
      return <ErrorScreen text={this.state.errorText} />;
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  // components/AppText.tsx's Text wrapper picks between these by weight/
  // style, so nothing downstream needs to know the file names — but
  // nothing can render with the right typeface until they're actually
  // loaded, hence the blank/spinner gate below.
  const [fontsLoaded] = useFonts(FONT_FILES);

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
    return <ErrorScreen text={errorText} />;
  }

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FatalErrorBoundary>
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
    </FatalErrorBoundary>
  );
}
