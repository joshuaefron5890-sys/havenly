import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DesktopTabSidebar } from '../../components/DesktopTabSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { registerForPushNotificationsAsync } from '../../lib/pushNotifications';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const isDesktop = useIsDesktop();

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

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // The sidebar (DesktopTabSidebar) replaces the bottom bar on
        // desktop rather than the two coexisting — Tabs itself stays
        // mounted either way, since it's still what actually owns which
        // screen is showing.
        tabBarStyle: isDesktop
          ? { display: 'none' }
          : { backgroundColor: colors.surface, borderTopColor: colors.border },
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
        name="families"
        options={{
          title: 'Families',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
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
        name="resources"
        options={{
          title: 'Resources',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRow}>
        <DesktopTabSidebar />
        <View style={styles.desktopMain}>{tabs}</View>
      </View>
    );
  }

  return tabs;
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
