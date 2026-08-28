import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { showAlert } from '../../lib/alert';
import { auth, signOutUser } from '../../lib/firebase';
import {
  fetchSitterConfirmedPlaydates,
  fetchSitterPlaydateRequests,
  PlaydateProposal,
  proposalStartLabel,
  respondAsSitter,
} from '../../lib/playdateProposals';
import { fetchMySitterProfile, SitterProfile } from '../../lib/sitters';
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
  const [requests, setRequests] = useState<PlaydateProposal[]>([]);
  const [confirmed, setConfirmed] = useState<PlaydateProposal[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadPlaydates = useCallback(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    fetchSitterPlaydateRequests(uid).then(setRequests);
    fetchSitterConfirmedPlaydates(uid).then(setConfirmed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMySitterProfile().then((result) => {
        if (!cancelled) setProfile(result);
      });
      loadPlaydates();
      return () => {
        cancelled = true;
      };
    }, [loadPlaydates])
  );

  const respond = async (proposalId: string, status: 'confirmed' | 'declined') => {
    if (respondingId) return;
    setRespondingId(proposalId);
    try {
      await respondAsSitter(proposalId, status);
      loadPlaydates();
    } catch (err: any) {
      showAlert('Couldn’t save your response', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  };

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

        <Pressable style={styles.availabilityCard} onPress={() => router.push('/availability')}>
          <View style={styles.availabilityTextWrap}>
            <Text style={styles.availabilityTitle}>My availability</Text>
            <Text style={styles.availabilitySubtitle}>
              {profile.availability.length
                ? `${profile.availability.length} window${profile.availability.length === 1 ? '' : 's'} set${
                    profile.googleCalendarConnected ? ' · Calendar connected' : ''
                  }`
                : "Set when you're free — this is what families see"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {requests.length ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>PLAYDATE REQUESTS</Text>
            {requests.map((proposal) => (
              <View key={proposal.id} style={styles.playdateRow}>
                <View style={styles.playdateInfo}>
                  <Text style={styles.playdateDate}>{proposalStartLabel(proposal)}</Text>
                  {proposal.venue ? <Text style={styles.playdateVenue}>{proposal.venue}</Text> : null}
                </View>
                <View style={styles.playdateActions}>
                  <Pressable
                    style={[styles.declineChip, respondingId === proposal.id && styles.chipDisabled]}
                    onPress={() => respond(proposal.id, 'declined')}
                    disabled={!!respondingId}
                  >
                    <Text style={styles.declineChipText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmChip, respondingId === proposal.id && styles.chipDisabled]}
                    onPress={() => respond(proposal.id, 'confirmed')}
                    disabled={!!respondingId}
                  >
                    <Text style={styles.confirmChipText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {confirmed.length ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>CONFIRMED PLAYDATES</Text>
            {confirmed.map((proposal) => (
              <View key={proposal.id} style={styles.playdateRow}>
                <View style={styles.playdateInfo}>
                  <Text style={styles.playdateDate}>{proposalStartLabel(proposal)}</Text>
                  {proposal.venue ? <Text style={styles.playdateVenue}>{proposal.venue}</Text> : null}
                </View>
                <View style={[styles.statusPill, { backgroundColor: colors.positiveMuted }]}>
                  <Text style={[styles.statusPillText, { color: colors.positive }]}>Confirmed</Text>
                </View>
              </View>
            ))}
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
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accentMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  availabilityTextWrap: {
    flex: 1,
  },
  availabilityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  availabilitySubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  playdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playdateInfo: {
    flex: 1,
  },
  playdateDate: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  playdateVenue: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  playdateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  declineChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  confirmChip: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.surface,
  },
  chipDisabled: {
    opacity: 0.6,
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
