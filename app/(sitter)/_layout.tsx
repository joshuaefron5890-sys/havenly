import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { registerForPushNotificationsAsync } from '../../lib/pushNotifications';
import { colors } from '../../theme/colors';

// Sitters are a completely separate account type from families (see
// lib/sitters.ts) — this route group is their whole app shell, parallel to
// (tabs) but with none of the family-facing tab bar. Just one screen for
// now (their own profile); more (e.g. "Requests") can join this group later
// without touching (tabs) at all.
export default function SitterLayout() {
  const { user, loading } = useAuth();

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

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
