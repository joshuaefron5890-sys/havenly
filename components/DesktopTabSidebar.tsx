import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

// Mirrors app/(tabs)/_layout.tsx's Tabs.Screen list one-for-one — same
// order, same icons, same titles. usePathname() strips the '(tabs)' group
// marker (see ResponsiveContainer's isDesktopEligibleRoute comment), so
// paths here are the plain, already-collapsed URLs.
const NAV_ITEMS: { path: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { path: '/', label: 'Home', icon: 'home-outline' },
  { path: '/families', label: 'Families', icon: 'people-outline' },
  { path: '/events', label: 'Events', icon: 'calendar-outline' },
  { path: '/products', label: 'Products', icon: 'bag-outline' },
  { path: '/podcasts', label: 'Podcasts', icon: 'mic-outline' },
  { path: '/articles', label: 'Resources', icon: 'document-text-outline' },
];

// Desktop-only replacement for the bottom tab bar (see
// app/(tabs)/_layout.tsx) — a sidebar reads better than a bottom bar once
// there's a whole desktop browser window's worth of height to work with.
// Navigates by pushing the tab's own route directly rather than going
// through React Navigation's tab bar machinery, since Tabs itself stays
// mounted underneath (just with its default tabBarStyle hidden) and still
// owns which screen is actually showing.
export function DesktopTabSidebar() {
  const pathname = usePathname();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
        <Text style={styles.wordmark}>
          Haven<Text style={styles.wordmarkAccent}>.ly</Text>
        </Text>
      </View>
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(`/(tabs)${item.path === '/' ? '' : item.path}` as any)}
            >
              <Ionicons name={item.icon} size={17} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 226,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    marginBottom: 20,
  },
  brandMark: {
    width: 20,
    height: 20,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  wordmarkAccent: {
    color: colors.accent,
    fontStyle: 'italic',
  },
  nav: {
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
  },
  navItemActive: {
    backgroundColor: colors.accentMuted,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  navLabelActive: {
    color: colors.accent,
  },
});
