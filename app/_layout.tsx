import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { AuthProvider } from '../contexts/AuthContext';
import { colors } from '../theme/colors';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <ResponsiveContainer>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ResponsiveContainer>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
