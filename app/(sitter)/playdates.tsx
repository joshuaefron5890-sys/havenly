import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { showAlert } from '../../lib/alert';
import { auth } from '../../lib/firebase';
import { familyDisplayName, familyPhoto, fetchPlaydateFamilies, SitterVisibleFamily } from '../../lib/families';
import { requestGoogleCalendarAuthCode } from '../../lib/googleIdentity';
import {
  fetchSitterConfirmedPlaydates,
  fetchSitterPlaydateRequests,
  PlaydateProposal,
  proposalStartLabel,
  respondAsSitter,
} from '../../lib/playdateProposals';
import { connectSitterGoogleCalendarBackend, fetchMySitterProfile, saveMySitterProfile, SitterProfile } from '../../lib/sitters';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

// A compact, non-interactive version of app/proposal/[id].tsx's FamilyMini —
// no match score (meaningless for a sitter, who isn't being matched against
// either family) and no tap-through to a family's public profile (that
// screen assumes family auth context the same way /proposal/[id] used to,
// per app/find-sitter.tsx's own notifyOnSitterConfirmation comment — not
// worth risking the same class of bug here for a nice-to-have). Does show
// each kid's neurodivergence tags, though, unlike FamilyMini — a sitter
// actually caring for these kids needs that context to support them
// properly (see functions/index.js's getPlaydateFamilies for why this is
// safe to show here specifically, but not on family-to-family screens).
function FamilyBlock({ family, fallbackLabel }: { family: SitterVisibleFamily | undefined; fallbackLabel: string }) {
  const kids = (family?.children ?? []).filter((c) => c.name);
  return (
    <View style={styles.familyBlock}>
      <Photo
        source={family && familyPhoto(family) ? { uri: familyPhoto(family)! } : undefined}
        style={styles.familyPhoto}
        variant="person"
        iconSize={18}
      />
      <View style={styles.familyTextWrap}>
        <Text style={styles.familyName} numberOfLines={1}>
          {family ? familyDisplayName(family) : fallbackLabel}
        </Text>
        {family?.city ? (
          <Text style={styles.familyLocation} numberOfLines={1}>
            {family.city}, {family.state}
          </Text>
        ) : null}
        {kids.map((kid, i) => (
          <View key={`${kid.name}-${i}`} style={styles.kidBlock}>
            <Text style={styles.familyKids} numberOfLines={1}>
              {kid.age ? `${kid.name}, ${kid.age}` : kid.name}
            </Text>
            {kid.neurodivergence.length ? (
              <View style={styles.diagnosisRow}>
                {kid.neurodivergence.map((tag) => (
                  <View key={tag} style={styles.diagnosisTag}>
                    <Text style={styles.diagnosisTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function SitterPlaydates() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile | null>(null);
  const [requests, setRequests] = useState<PlaydateProposal[]>([]);
  const [confirmed, setConfirmed] = useState<PlaydateProposal[]>([]);
  const [families, setFamilies] = useState<Map<string, SitterVisibleFamily>>(new Map());
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Batched into one call per load rather than one per card — same
  // reasoning as lib/families.ts's own fetchContributorPhotos. Passes
  // proposal ids, not family uids — getPlaydateFamilies checks per id that
  // the caller is actually the assigned sitter before including that
  // proposal's families at all.
  const loadFamilies = async (proposals: PlaydateProposal[]) => {
    const proposalIds = proposals.map((p) => p.id);
    if (!proposalIds.length) return;
    const result = await fetchPlaydateFamilies(proposalIds);
    setFamilies((prev) => {
      const next = new Map(prev);
      result.forEach((f) => next.set(f.uid, f));
      return next;
    });
  };

  const load = useCallback(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    fetchMySitterProfile().then(setProfile);
    fetchSitterPlaydateRequests(uid).then((result) => {
      setRequests(result);
      loadFamilies(result);
    });
    fetchSitterConfirmedPlaydates(uid).then((result) => {
      setConfirmed(result);
      loadFamilies(result);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const uid = auth?.currentUser?.uid;
      Promise.all([
        fetchMySitterProfile(),
        uid ? fetchSitterPlaydateRequests(uid) : Promise.resolve([]),
        uid ? fetchSitterConfirmedPlaydates(uid) : Promise.resolve([]),
      ]).then(([profileResult, requestsResult, confirmedResult]) => {
        if (cancelled) return;
        setProfile(profileResult);
        setRequests(requestsResult);
        setConfirmed(confirmedResult);
        loadFamilies([...requestsResult, ...confirmedResult]);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const respond = async (proposalId: string, status: 'confirmed' | 'declined') => {
    if (respondingId) return;
    setRespondingId(proposalId);
    try {
      await respondAsSitter(proposalId, status);
      load();
    } catch (err: any) {
      showAlert('Couldn’t save your response', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  };

  // Requests the broader calendar.events (read/write) scope explicitly —
  // this is the one place in the app that ever does, since it's the one
  // place a sitter is actually deciding "yes, put my confirmed playdates on
  // this calendar." Google treats that as a sensitive scope and shows an
  // "unverified app" warning until Opened Circle completes verification; the
  // read-only Connect on the availability screen never touches this path,
  // so reconnecting there can't accidentally downgrade what's granted here.
  const handleConnectGoogle = async () => {
    setGoogleError(null);
    if (!auth?.currentUser) {
      setGoogleError('Your sign-in session has expired — log out and back in, then try again.');
      return;
    }
    setConnectingGoogle(true);
    try {
      const code = await requestGoogleCalendarAuthCode(true);
      await connectSitterGoogleCalendarBackend(code);
      await saveMySitterProfile({ googleCalendarConnected: true, googleCalendarSyncEnabled: true }, false);
      setProfile((prev) => (prev ? { ...prev, googleCalendarConnected: true, googleCalendarSyncEnabled: true } : prev));
    } catch (err: any) {
      if (err?.message?.includes('closed')) {
        setGoogleError('Google reported the popup closed early — this can be a false alarm, please try again.');
      } else {
        setGoogleError(`Couldn’t connect Google Calendar (${err?.message ?? err?.code ?? 'unknown error'}).`);
      }
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Turning it off needs no new Google permission — it just stops the
  // backend from attempting writes — so it saves immediately. Turning it
  // on needs a real consent grant, so it runs the full connect flow.
  const handleToggleSync = (value: boolean) => {
    if (!value) {
      saveMySitterProfile({ googleCalendarSyncEnabled: false }, false).catch(() => {});
      setProfile((prev) => (prev ? { ...prev, googleCalendarSyncEnabled: false } : prev));
      return;
    }
    handleConnectGoogle();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Playdates</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.calendarCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.calendarName}>Add confirmed playdates to my calendar</Text>
            {connectingGoogle ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
          <Text style={styles.calendarHint}>
            {profile?.googleCalendarSyncEnabled
              ? 'On — a confirmed playdate gets added to your Google Calendar automatically.'
              : 'Off — needs an extra Google permission beyond the one used for availability matching; you may see an "unverified app" warning, choose Advanced → Go to Opened Circle (unsafe) to continue.'}
          </Text>
          {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
          <View style={styles.syncRow}>
            <Image source={images.googleLogo} style={styles.brandIcon} />
            <Text style={styles.syncRowLabel}>Google Calendar</Text>
            <Switch value={profile?.googleCalendarSyncEnabled ?? false} onValueChange={handleToggleSync} disabled={connectingGoogle} />
          </View>
        </View>

        <Text style={styles.label}>PLAYDATE REQUESTS</Text>
        {requests.length ? (
          requests.map((proposal) => (
            <View key={proposal.id} style={styles.playdateCard}>
              <View style={styles.playdateHeaderRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                <Text style={styles.playdateDate}>{proposalStartLabel(proposal)}</Text>
              </View>
              {proposal.venue ? (
                <View style={styles.playdateDetailRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.playdateDetailText}>{proposal.venue}</Text>
                </View>
              ) : null}
              {proposal.note ? (
                <View style={styles.playdateDetailRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.playdateDetailText}>{proposal.note}</Text>
                </View>
              ) : null}

              <View style={styles.familiesRow}>
                <FamilyBlock family={families.get(proposal.fromUid)} fallbackLabel="A family" />
                <FamilyBlock family={families.get(proposal.toUid)} fallbackLabel="A family" />
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
          ))
        ) : (
          <EmptyState text="No pending requests right now." />
        )}

        <Text style={styles.label}>CONFIRMED PLAYDATES</Text>
        {confirmed.length ? (
          confirmed.map((proposal) => (
            <View key={proposal.id} style={styles.playdateCard}>
              <View style={styles.playdateHeaderRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                <Text style={styles.playdateDate}>{proposalStartLabel(proposal)}</Text>
                <View style={[styles.statusPill, { backgroundColor: colors.positiveMuted }]}>
                  <Text style={[styles.statusPillText, { color: colors.positive }]}>Confirmed</Text>
                </View>
              </View>
              {proposal.venue ? (
                <View style={styles.playdateDetailRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.playdateDetailText}>{proposal.venue}</Text>
                </View>
              ) : null}
              {proposal.note ? (
                <View style={styles.playdateDetailRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.playdateDetailText}>{proposal.note}</Text>
                </View>
              ) : null}

              <View style={styles.familiesRow}>
                <FamilyBlock family={families.get(proposal.fromUid)} fallbackLabel="A family" />
                <FamilyBlock family={families.get(proposal.toUid)} fallbackLabel="A family" />
              </View>
            </View>
          ))
        ) : (
          <EmptyState text="Nothing confirmed yet." />
        )}
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
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
    paddingBottom: 40,
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  calendarName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  calendarHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  brandIcon: {
    width: 16,
    height: 16,
  },
  syncRowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },
  playdateCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  playdateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playdateDate: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  playdateDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  playdateDetailText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  familiesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  familyBlock: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  familyPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  familyTextWrap: {
    flex: 1,
  },
  familyName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  familyLocation: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  kidBlock: {
    marginTop: 4,
  },
  familyKids: {
    fontSize: 11,
    color: colors.textMuted,
  },
  diagnosisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  diagnosisTag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  diagnosisTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
  },
  playdateActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  declineChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 10,
  },
  declineChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  confirmChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 10,
  },
  confirmChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
  chipDisabled: {
    opacity: 0.6,
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
});
