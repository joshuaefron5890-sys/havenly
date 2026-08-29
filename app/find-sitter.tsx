import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { Photo } from '../components/Photo';
import { showAlert } from '../lib/alert';
import { addSitterToPlaydate, PlaydateProposal, subscribeToProposal } from '../lib/playdateProposals';
import { AVAILABILITY_PERIODS, dateKey } from '../lib/sitterAvailability';
import { fetchRecommendedSitters, RecommendedSitter } from '../lib/sitters';
import { colors } from '../theme/colors';

const SITTER_STATUS_LABEL: Record<'pending' | 'confirmed' | 'declined', string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export default function FindSitter() {
  const { proposalId, date } = useLocalSearchParams<{ proposalId?: string; date?: string }>();
  const [sitters, setSitters] = useState<RecommendedSitter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingUid, setAddingUid] = useState<string | null>(null);
  // Live so this screen reflects reality if the currently-assigned sitter's
  // status changes (or someone cancels/reassigns from another tab) while
  // it's open — cheap single-document subscription, same as
  // app/proposal/[id].tsx's own use of subscribeToProposal.
  const [proposal, setProposal] = useState<PlaydateProposal | null>(null);

  useEffect(() => {
    if (!proposalId) return;
    return subscribeToProposal(proposalId, setProposal);
  }, [proposalId]);

  // Computed in the viewer's own local time (not the server's) so
  // "morning/afternoon/evening" lines up with how a sitter classified
  // that same slot when they marked their own availability — see
  // lib/sitters.ts's fetchRecommendedSitters.
  const slot = useMemo(() => {
    if (!date) return undefined;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return undefined;
    const hour = parsed.getHours();
    const period = AVAILABILITY_PERIODS.find((p) => hour >= p.startHour && hour < p.endHour);
    return period ? { dateKey: dateKey(parsed), period: period.key } : undefined;
  }, [date]);

  // Falls back to the proposal (or home) rather than silently no-opping
  // when there's no prior screen in the navigation stack to go back to —
  // e.g. this screen was reached via a direct link or a page refresh.
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (proposalId) {
      router.replace(`/proposal/${proposalId}`);
    } else {
      router.replace('/');
    }
  };

  const handleAdd = async (sitter: RecommendedSitter) => {
    if (!proposalId || addingUid) return;
    setAddingUid(sitter.uid);
    try {
      await addSitterToPlaydate(proposalId, sitter);
      // router.back() alone silently no-ops if this screen was reached
      // without a prior entry in the navigation stack (e.g. a direct link
      // or a page refresh) — the write still succeeds, but the button was
      // previously left stuck on "Adding…" forever with no error, since
      // addingUid was only ever reset in the catch branch.
      goBack();
      setAddingUid(null);
    } catch (err: any) {
      showAlert('Couldn’t add them to the playdate', err?.message ?? err?.code ?? 'Please try again.');
      setAddingUid(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const assignedUid = proposal?.sitter?.uid;
      fetchRecommendedSitters(slot)
        .then((result) => {
          // When we know the exact slot, only show sitters who've actually
          // marked themselves available for it — otherwise "availableForSlot"
          // means nothing (every sitter comes back false with no slot to
          // check against), so the filter only applies when there's a real
          // slot to filter by. The currently-assigned sitter is always kept
          // regardless, so their pending/confirmed/declined status never
          // silently disappears just because their availability record
          // doesn't happen to line up.
          if (!cancelled) setSitters(slot ? result.filter((s) => s.availableForSlot || s.uid === assignedUid) : result);
        })
        .catch((err: any) => {
          if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot?.dateKey, slot?.period, proposal?.sitter?.uid])
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={goBack}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Find Help</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          {slot
            ? 'Experienced help near you who’ve confirmed they’re free for this playdate, matched to your kids’ experience.'
            : 'Experienced help near you, sorted by how much of their experience matches your kids’.'}
        </Text>

        {error ? <EmptyState text={`Couldn’t load results (${error}).`} /> : null}
        {sitters === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {sitters?.length === 0 ? (
          <EmptyState
            text={
              slot
                ? 'No one has confirmed availability for this playdate yet — check back soon.'
                : 'No experienced help in your area yet — check back soon.'
            }
          />
        ) : null}

        {sitters?.map((sitter) => {
          const assignedStatus = proposal?.sitter?.uid === sitter.uid ? proposal!.sitter!.confirmationStatus : null;
          return (
          <View key={sitter.uid} style={styles.card}>
            {assignedStatus ? (
              <View
                style={[
                  styles.availabilityBadge,
                  assignedStatus === 'confirmed' && styles.availabilityBadgeAvailable,
                  assignedStatus === 'declined' && styles.availabilityBadgeDeclined,
                ]}
              >
                <Ionicons
                  name={assignedStatus === 'confirmed' ? 'checkmark-circle' : assignedStatus === 'declined' ? 'close-circle' : 'time-outline'}
                  size={14}
                  color={assignedStatus === 'confirmed' ? colors.positive : assignedStatus === 'declined' ? colors.error : colors.warning}
                />
                <Text
                  style={[
                    styles.availabilityBadgeText,
                    assignedStatus === 'confirmed' && styles.availabilityBadgeTextAvailable,
                    assignedStatus === 'declined' && styles.availabilityBadgeTextDeclined,
                  ]}
                >
                  {SITTER_STATUS_LABEL[assignedStatus]}
                </Text>
              </View>
            ) : slot ? (
              <View style={[styles.availabilityBadge, styles.availabilityBadgeAvailable]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
                <Text style={[styles.availabilityBadgeText, styles.availabilityBadgeTextAvailable]}>Open for this playdate</Text>
              </View>
            ) : null}
            <View style={styles.cardHeader}>
              <Photo
                source={sitter.photoUrl ? { uri: sitter.photoUrl } : undefined}
                style={styles.avatar}
                variant="person"
                iconSize={24}
              />
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{sitter.name}</Text>
                {sitter.city ? (
                  <Text style={styles.location}>
                    {sitter.city}, {sitter.state}
                  </Text>
                ) : null}
              </View>
              {sitter.matchScore > 0 ? (
                <View style={styles.matchPill}>
                  <Text style={styles.matchPillText}>{sitter.matchScore} in common</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              {sitter.yearsExperience ? <Field label="Experience" value={`${sitter.yearsExperience} yrs`} /> : null}
              {sitter.hourlyRate ? <Field label="Rate" value={sitter.hourlyRate} /> : null}
            </View>

            {sitter.bio ? <Text style={styles.bio}>{sitter.bio}</Text> : null}

            {sitter.specialties.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>EXPERIENCE WITH</Text>
                <View style={styles.tagRow}>
                  {sitter.specialties.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {sitter.certifications.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CREDENTIALS</Text>
                <View style={styles.tagRow}>
                  {sitter.certifications.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.contactLocked}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
              <Text style={styles.contactLockedText}>
                Contact info unlocks once you add them to the playdate, starting the day of
              </Text>
            </View>

            {proposalId && assignedStatus !== 'pending' && assignedStatus !== 'confirmed' ? (
              <View style={styles.addRow}>
                <Pressable
                  style={[styles.addButton, addingUid === sitter.uid && styles.addButtonDisabled]}
                  onPress={() => handleAdd(sitter)}
                  disabled={addingUid !== null}
                >
                  <Text style={styles.addButtonText}>
                    {addingUid === sitter.uid ? 'Adding…' : assignedStatus === 'declined' ? 'Invite again' : 'Add to Playdate'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
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
  },
  intro: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  spinner: {
    marginVertical: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.background,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  availabilityBadgeAvailable: {
    backgroundColor: colors.positiveMuted,
  },
  availabilityBadgeDeclined: {
    backgroundColor: colors.errorMuted,
  },
  availabilityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  availabilityBadgeTextAvailable: {
    color: colors.positive,
  },
  availabilityBadgeTextDeclined: {
    color: colors.error,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  cardHeaderText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  location: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  matchPill: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  matchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  field: {},
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  bio: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: 12,
  },
  section: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
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
  contactLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contactLockedText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  addRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
});
