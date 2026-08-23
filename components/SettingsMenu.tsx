import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './AppText';
import { MAX_CONTENT_WIDTH } from './ResponsiveContainer';
import { useAuth } from '../contexts/AuthContext';
import { signOutUser } from '../lib/firebase';
import { initials } from '../lib/initials';
import { isSuperAdminEmail } from '../lib/superAdmin';
import { colors } from '../theme/colors';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { user, familyMemberInfo, clusterId } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const { width } = useWindowDimensions();
  // The Google account photo URL can fail to load (expired, blocked by
  // referrer policy, etc.) — React Native Web then renders a broken-image
  // icon instead of quietly falling back, so track load failures ourselves.
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL, familyMemberInfo?.photoUrl]);

  // Modal portals straight to the browser's <body> on web, so it renders
  // relative to the full browser window rather than ResponsiveContainer's
  // centered phone-width column — without this, the menu lands in the gray
  // backdrop off to the side on a wide (desktop) viewport instead of under
  // the gear icon. This mirrors ResponsiveContainer's own centering math to
  // land the menu back inside the visible column.
  const isWide = width > MAX_CONTENT_WIDTH;
  const rightInset = (isWide ? (width - MAX_CONTENT_WIDTH) / 2 : 0) + 20;

  const goToProfile = () => {
    setOpen(false);
    router.push('/profile');
  };

  const goToSitterVetting = () => {
    setOpen(false);
    router.push('/admin/sitters');
  };

  const goToHiddenContent = () => {
    setOpen(false);
    router.push('/admin/hidden');
  };

  const logOut = async () => {
    setOpen(false);
    await signOutUser();
    // A plain router.replace('/') can land back on the tabs' own index
    // screen instead of the true landing page, since both resolve to "/" —
    // a full reload sidesteps that ambiguity and guarantees a clean state.
    if (Platform.OS === 'web') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  };

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        <Ionicons name="settings-outline" size={22} color={colors.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.menu, { marginRight: rightInset }]} onPress={() => {}}>
            <Pressable style={styles.item} onPress={goToProfile}>
              {(familyMemberInfo?.photoUrl || user?.photoURL) && !avatarFailed ? (
                <Image
                  source={{ uri: familyMemberInfo?.photoUrl ?? user!.photoURL! }}
                  style={styles.avatar}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>
                    {initials(familyMemberInfo?.name || user?.displayName, user?.email)}
                  </Text>
                </View>
              )}
              <Text style={styles.itemText}>Profile</Text>
            </Pressable>
            {isAdmin ? (
              <>
                <View style={styles.divider} />
                <Pressable style={styles.item} onPress={goToSitterVetting}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
                  <Text style={styles.itemText}>Vet sitters</Text>
                </Pressable>
                <Pressable style={styles.item} onPress={goToHiddenContent}>
                  <Ionicons name="eye-off-outline" size={18} color={colors.text} />
                  <Text style={styles.itemText}>Hidden items</Text>
                </Pressable>
              </>
            ) : null}
            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={logOut}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={[styles.itemText, styles.logoutText]}>Log out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'flex-end',
  },
  menu: {
    marginTop: 60,
    minWidth: 170,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.text,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  logoutText: {
    color: colors.error,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
});
