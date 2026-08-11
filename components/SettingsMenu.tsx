import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { signOutUser } from '../lib/firebase';
import { colors } from '../theme/colors';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);

  const goToProfile = () => {
    setOpen(false);
    router.push('/profile');
  };

  const logOut = async () => {
    setOpen(false);
    await signOutUser();
    // A plain router.replace('/') can land back on the tabs' own index
    // screen instead of the true landing page, since both resolve to "/" —
    // a full reload sidesteps that ambiguity and guarantees a clean state.
    if (Platform.OS === 'web') {
      window.location.href = '/havenly/';
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
          <Pressable style={styles.menu} onPress={() => {}}>
            <Pressable style={styles.item} onPress={goToProfile}>
              <Ionicons name="person-outline" size={18} color={colors.text} />
              <Text style={styles.itemText}>Profile</Text>
            </Pressable>
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
    marginRight: 20,
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
