import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { registerForPushNotificationsAsync } from '../../lib/pushNotifications';
import { colors } from '../../theme/colors';

export default function TabsLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    // A stale/expired session left this route rendering as if signed in
    // (e.g. after a page refresh) — send back to sign-in instead of
    // showing tabs with nothing real behind them.
    router.replace('/sign-in');
  }, [loading, user]);

  // Registered against the signed-in person's own uid (not familyUid —
  // see lib/pushNotifications.ts), once per session reaching the tabs.
  // Best-effort and silent: a denied permission or a simulator just means
  // registerForPushNotificationsAsync resolves null, nothing to react to.
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="podcasts"
        options={{
          title: 'Podcasts',
          tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="articles"
        options={{
          title: 'Resources',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
