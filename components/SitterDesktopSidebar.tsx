import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { signOutUser } from '../lib/firebase';
import { colors } from '../theme/colors';

// Mirrors app/(sitter)/_layout.tsx's Stack screens — Overview is index.tsx
// itself (there's no separate "Profile" screen; Overview already shows and
// edits the sitter's profile), Playdates and Availability are their own
// pushed screens.
const NAV_ITEMS: { path: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { path: '/', label: 'Overview', icon: 'person-circle-outline' },
  { path: '/playdates', label: 'Playdates', icon: 'calendar-outline' },
  { path: '/availability', label: 'Availability', icon: 'time-outline' },
];

// Desktop-only companion to app/(sitter)/index.tsx's own header — see that
// screen's isDesktop branch, which hides its own brand row + logout icon
// since this sidebar now carries both for every screen in the portal, not
// just Overview.
export function SitterDesktopSidebar() {
  const pathname = usePathname();

  const logOut = async () => {
    await signOutUser();
    if (Platform.OS === 'web') {
      window.location.href = '/sign-in';
    } else {
      router.replace('/sign-in');
    }
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
        <Text style={styles.wordmark}>Opened Circle for Sitters</Text>
      </View>
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.path as any)}
            >
              <Ionicons name={item.icon} size={17} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.spacer} />
      <Pressable style={styles.navItem} onPress={logOut}>
        <Ionicons name="log-out-outline" size={17} color={colors.textMuted} />
        <Text style={styles.navLabel}>Log out</Text>
      </Pressable>
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
    flexDirection: 'column',
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
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
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
  spacer: {
    flex: 1,
  },
});
