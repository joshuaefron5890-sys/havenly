import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../components/Photo';
import { useAuth } from '../contexts/AuthContext';
import { signOutUser } from '../lib/firebase';
import { colors } from '../theme/colors';

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email || '';
  if (!source) return '?';
  const parts = source.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function Profile() {
  const { user } = useAuth();

  const logOut = async () => {
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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.content}>
        {user?.photoURL ? (
          <Photo source={{ uri: user.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials(user?.displayName, user?.email)}</Text>
          </View>
        )}

        <Text style={styles.name}>{user?.displayName || 'Your account'}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <Pressable style={styles.logoutButton} onPress={logOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} style={styles.logoutIcon} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 16,
  },
  avatarFallback: {
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accent,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 32,
  },
  logoutButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
});
