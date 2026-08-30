import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SitterDesktopSidebar } from '../../components/SitterDesktopSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { registerForPushNotificationsAsync } from '../../lib/pushNotifications';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';

// Sitters are a completely separate account type from families (see
// lib/sitters.ts) — this route group is their whole app shell, parallel to
// (tabs). On desktop (see useIsDesktop below), SitterDesktopSidebar stands
// in for the per-screen headers' brand row + logout; below that width,
// every screen still renders its own header exactly as before.
export default function SitterLayout() {
  const { user, loading } = useAuth();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (loading || user) return;
    router.replace('/sign-in');
  }, [loading, user]);

  // Same registration as (tabs) — pushTokens/{uid} is keyed by whoever's
  // actually signed in, family or sitter alike (see lib/pushNotifications.ts).
  useEffect(() => {
    if (!user) return;
    registerForPushNotificationsAsync(user.uid);
  }, [user]);

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;

  if (isDesktop) {
    return (
      <View style={styles.desktopRow}>
        <SitterDesktopSidebar />
        <View style={styles.desktopMain}>{stack}</View>
      </View>
    );
  }

  return stack;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopMain: {
    flex: 1,
  },
});
