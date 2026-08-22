import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { fetchMySitterProfile, SitterProfile } from '../../lib/sitters';
import { signOutUser } from '../../lib/firebase';
import { colors } from '../../theme/colors';

const STATUS_LABEL: Record<SitterProfile['backgroundCheckStatus'], string> = {
  pending: 'Background check pending',
  clear: 'Verified',
  flagged: 'Needs attention',
};

const STATUS_COLORS: Record<SitterProfile['backgroundCheckStatus'], { bg: string; text: string }> = {
  pending: { bg: colors.warningMuted, text: colors.warning },
  clear: { bg: colors.positiveMuted, text: colors.positive },
  flagged: { bg: colors.errorMuted, text: colors.error },
};

export default function SitterHome() {
  const [profile, setProfile] = useState<SitterProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMySitterProfile().then((result) => {
        if (!cancelled) setProfile(result);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const logOut = async () => {
    await signOutUser();
    if (Platform.OS === 'web') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  };

  if (!profile) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const status = STATUS_COLORS[profile.backgroundCheckStatus];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Image source={require('../../assets/logo-mark.png')} style={styles.mark} resizeMode="contain" />
        <Text style={styles.headerTitle}>Haven.ly for Sitters</Text>
        <Pressable onPress={logOut} hitSlop={8}>
          <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Photo source={profile.photoUrl ? { uri: profile.photoUrl } : undefined} style={styles.avatar} variant="person" iconSize={28} />
          <Text style={styles.name}>{profile.name}</Text>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusPillText, { color: status.text }]}>{STATUS_LABEL[profile.backgroundCheckStatus]}</Text>
          </View>
        </View>

        {profile.backgroundCheckStatus === 'pending' ? (
          <View style={styles.notice}>
            <Ionicons name="time-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              We’re reviewing your background check. You won’t show up in any family’s recommendations until
              that’s cleared.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Field label="Location" value={profile.city ? `${profile.city}, ${profile.state}` : ''} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Years of experience" value={profile.yearsExperience} />
          <Field label="Hourly rate" value={profile.hourlyRate} />
          <Field label="About" value={profile.bio} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>EXPERIENCE WITH</Text>
          {profile.specialties.length ? (
            <View style={styles.tagRow}>
              {profile.specialties.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Nothing added yet</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CREDENTIALS</Text>
          {profile.certifications.length ? (
            <View style={styles.tagRow}>
              {profile.certifications.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Nothing added yet</Text>
          )}
        </View>

        <Pressable style={styles.editButton} onPress={() => router.push('/sitter-signup?edit=1')}>
          <Text style={styles.editButtonText}>Edit profile</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  mark: {
    width: 18,
    height: 18,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
  },
  identity: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 10,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.warningMuted,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 15,
    color: colors.text,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
});
