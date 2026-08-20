import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { AuthProvider } from '../contexts/AuthContext';
import { MessagesProvider } from '../contexts/MessagesContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { colors } from '../theme/colors';

export default function RootLayout() {
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
