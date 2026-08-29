import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddToGoogleCalendarPrompt } from '../../components/AddToGoogleCalendarPrompt';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { showAlert } from '../../lib/alert';
import {
  familyDisplayName,
  familyPhoto,
  FamilyProfile,
  fetchFamiliesByUids,
  fetchFamilyProfile,
  SuggestedFamily,
  SuggestedFamilyChild,
} from '../../lib/families';
import { addPlaydateToGoogleCalendar } from '../../lib/googleCalendar';
import { loadOnboardingProgress } from '../../lib/onboardingProgress';
import { cancelProposal, PlaydateProposal, respondToProposal, subscribeToProposal } from '../../lib/playdateProposals';
import { SITTERS_ENABLED } from '../../lib/sitters';
import { colors } from '../../theme/colors';

const STATUS_LABEL: Record<PlaydateProposal['status'], string> = {
  proposed: 'Waiting for a response',
  accepted: 'Accepted',
  declined: 'Declined',
  canceled: 'Canceled',
};

const SITTER_CONFIRM_LABEL: Record<NonNullable<PlaydateProposal['sitter']>['confirmationStatus'], string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

// A compact "who's coming" card — used for both sides of the playdate, side
// by side. Takes either a SuggestedFamily (the signed-in user's own family,
// via getFamiliesByUids) or a FamilyProfile (the other family, via
// getFamilyProfile) — both share the same display fields, so one component
// covers both.
function FamilyMini({
  family,
  fallbackLabel,
  onPress,
}: {
  family: SuggestedFamily | FamilyProfile | null;
  fallbackLabel: string;
  onPress?: () => void;
}) {
  const kids = (family?.children ?? []).filter((c: SuggestedFamilyChild) => c.name);
  const content = (
    <View style={styles.familyCard}>
      <Photo
        source={family && familyPhoto(family) ? { uri: familyPhoto(family)! } : undefined}
        style={styles.familyPhoto}
        variant="person"
        iconSize={26}
      />
      <Text style={styles.familyName} numberOfLines={1}>
        {family ? familyDisplayName(family) : fallbackLabel}
      </Text>
      {family?.city ? (
        <Text style={styles.familyLocation} numberOfLines={1}>
          {family.city}, {family.state}
        </Text>
      ) : null}
      {kids.length > 0 ? (
        <View style={styles.kidsList}>
          {kids.map((kid, i) => (
            <View key={`${kid.name}-${i}`} style={styles.kidChip}>
              <Photo source={kid.photoUrl ? { uri: kid.photoUrl } : undefined} style={styles.kidPhoto} variant="person" iconSize={11} />
              <Text style={styles.kidChipText} numberOfLines={1}>
                {kid.age ? `${kid.name}, ${kid.age}` : kid.name}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyInline}>No kids listed yet</Text>
      )}
    </View>
  );
  if (!onPress) return content;
  // Needs flex: 1 explicitly — as the actual flex-row child in place of the
  // plain View above, an unstyled Pressable shrinks to hug its content
  // instead of stretching to match its sibling, which is what made the
  // tappable "other family" card visibly narrower than "my family"'s.
  return (
    <Pressable style={styles.familyCardPressable} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export default function ProposalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, familyUid, loading: authLoading } = useAuth();
  const [proposal, setProposal] = useState<PlaydateProposal | null | undefined>(undefined);
  const [otherFamily, setOtherFamily] = useState<FamilyProfile | null>(null);
  const [myFamily, setMyFamily] = useState<SuggestedFamily | null>(null);
  const [responding, setResponding] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // A signed-out visitor (e.g. opening an emailed link cold, in a private
  // window) would otherwise spin forever below: subscribeToProposal's
  // Firestore listener has no error handler, so firestore.rules denying
  // the unauthenticated read just silently never calls back, rather than
  // resolving to null. Bouncing to sign-in first avoids ever hitting that.
  useEffect(() => {
    if (authLoading || user) return;
    router.replace('/sign-in');
  }, [authLoading, user]);

  // Own profile isn't hydrated by default on this route (only the
  // onboarding wizard's own layout does that) — needed here just to check
  // googleCalendarSyncEnabled, so the "add to calendar?" prompt doesn't
  // nag someone who already opted in. Same pattern app/profile.tsx uses.
  const { profile, updateProfile } = useOnboarding();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadOnboardingProgress(familyUid ?? user.uid).then((progress) => {
      if (!cancelled && progress && Object.keys(progress.profile).length) {
        updateProfile(progress.profile);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, familyUid]);

  const [syncPromptProposalId, setSyncPromptProposalId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    return subscribeToProposal(id, setProposal);
  }, [id]);

  const otherUid =
    proposal && familyUid ? (proposal.fromUid === familyUid ? proposal.toUid : proposal.fromUid) : undefined;

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    fetchFamilyProfile(otherUid).then((result) => {
      if (!cancelled) setOtherFamily(result);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  useEffect(() => {
    if (!familyUid) return;
    let cancelled = false;
    fetchFamiliesByUids([familyUid]).then((result) => {
      if (!cancelled && result[0]) setMyFamily(result[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [familyUid]);

  const respond = async (status: 'accepted' | 'declined') => {
    if (!id || responding) return;
    setResponding(true);
    try {
      await respondToProposal(id, status);
      // Only worth asking if they haven't already opted in — someone who
      // has gets this automatically via the accept-time trigger, no prompt
      // needed.
      if (status === 'accepted' && !profile.googleCalendarSyncEnabled) {
        setSyncPromptProposalId(id);
      }
    } catch (err: any) {
      showAlert('Couldn’t save your response', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setResponding(false);
    }
  };

  const proposeNewTime = () => {
    if (!otherUid) return;
    router.push(`/propose-playdate?familyId=${otherUid}`);
  };

  // Only the family who created the proposal can cancel it, and only
  // before it's been declined or already cancelled — enforced again
  // server-side in firestore.rules. Cancelling an accepted playdate also
  // removes it from either connected calendar (functions/index.js's
  // cancelPlaydateCalendarEvents).
  const handleCancel = async () => {
    if (!id || canceling) return;
    setCanceling(true);
    try {
      await cancelProposal(id);
    } catch (err: any) {
      showAlert('Couldn’t cancel this playdate', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  if (authLoading || !user || proposal === undefined) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (proposal === null) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <EmptyState text="Couldn’t find that proposal." />
        </View>
      </SafeAreaView>
    );
  }

  const isRecipient = familyUid === proposal.toUid;
  const canRespond = isRecipient && proposal.status === 'proposed';
  const isCreator = familyUid === proposal.fromUid;
  const canCancel = isCreator && (proposal.status === 'proposed' || proposal.status === 'accepted');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Playdate</Text>
        <View style={[styles.statusPill, proposal.status !== 'proposed' && styles[`statusPill_${proposal.status}`]]}>
          <Text style={styles.statusPillText}>{STATUS_LABEL[proposal.status]}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.familiesRow}>
          <FamilyMini family={myFamily} fallbackLabel="You" />
          <View style={styles.connector}>
            {otherFamily ? (
              <>
                <Text style={styles.connectorScore}>{otherFamily.matchScore}%</Text>
                <Text style={styles.connectorScoreLabel}>match</Text>
              </>
            ) : (
              <Ionicons name="people" size={16} color={colors.accent} />
            )}
          </View>
          <FamilyMini
            family={otherFamily}
            fallbackLabel="…"
            onPress={otherUid ? () => router.push(`/family/${otherUid}`) : undefined}
          />
        </View>

        {otherFamily && otherFamily.sharedNeurodivergence.length > 0 && (
          <View style={styles.sharedExperienceRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={styles.sharedExperienceText}>
              Shared experience with {otherFamily.sharedNeurodivergence.join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="calendar" size={18} color={colors.accent} />
            <Text style={styles.rowText}>{proposal.dateLabel}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="location" size={18} color={colors.accent} />
            <Text style={styles.rowText}>{proposal.venue}</Text>
          </View>
          {proposal.note ? (
            <View style={styles.row}>
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.accent} />
              <Text style={styles.rowText}>{proposal.note}</Text>
            </View>
          ) : null}
        </View>

        {SITTERS_ENABLED && proposal.status === 'accepted' && proposal.sitter ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SITTER</Text>
            <View style={styles.assignedSitterRow}>
              <Photo
                source={proposal.sitter.photoUrl ? { uri: proposal.sitter.photoUrl } : undefined}
                style={styles.assignedSitterPhoto}
                variant="person"
                iconSize={18}
              />
              <View style={styles.assignedSitterInfo}>
                <Text style={styles.assignedSitterName}>{proposal.sitter.name}</Text>
                {proposal.sitter.specialties.length ? (
                  <Text style={styles.assignedSitterMeta} numberOfLines={1}>
                    {proposal.sitter.specialties.join(', ')}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.sitterConfirmPill,
                  styles[`sitterConfirmPill_${proposal.sitter.confirmationStatus}`],
                ]}
              >
                <Text style={styles.sitterConfirmPillText}>{SITTER_CONFIRM_LABEL[proposal.sitter.confirmationStatus]}</Text>
              </View>
            </View>
            <View style={styles.contactRow}>
              {proposal.sitter.phone ? (
                <View style={styles.contactItem}>
                  <Ionicons name="call-outline" size={13} color={colors.accent} />
                  <Text style={styles.contactText}>{proposal.sitter.phone}</Text>
                </View>
              ) : null}
              {proposal.sitter.email ? (
                <View style={styles.contactItem}>
                  <Ionicons name="mail-outline" size={13} color={colors.accent} />
                  <Text style={styles.contactText}>{proposal.sitter.email}</Text>
                </View>
              ) : null}
            </View>
            <Pressable onPress={() => router.push(`/find-sitter?proposalId=${id}&date=${encodeURIComponent(proposal.date)}`)}>
              <Text style={styles.changeSitterLink}>Change sitter</Text>
            </Pressable>
          </View>
        ) : SITTERS_ENABLED && proposal.status === 'accepted' ? (
          <View style={styles.sitterPromo}>
            <View style={styles.sitterPromoIcon}>
              <Ionicons name="heart" size={22} color={colors.accent} />
            </View>
            <Text style={styles.sitterPromoTitle}>Want to actually enjoy this one?</Text>
            <Text style={styles.sitterPromoText}>
              Bring in a vetted local sitter with an open slot for this exact time, so you can relax and connect
              with the other parents instead of watching the kids.
            </Text>
            <Pressable
              style={styles.sitterPromoButton}
              onPress={() => router.push(`/find-sitter?proposalId=${id}&date=${encodeURIComponent(proposal.date)}`)}
            >
              <Text style={styles.sitterPromoButtonText}>Find Help</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>COMMON INTERESTS</Text>
          {otherFamily && otherFamily.sharedInterests.length > 0 ? (
            <View style={styles.tags}>
              {otherFamily.sharedInterests.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyInline}>No shared interests yet.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT YOU HAVE IN COMMON</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Play style</Text>
            <Text style={styles.infoValue}>{otherFamily?.sharedPlayStyle.join(' · ') || 'No overlap yet'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Times that work for both</Text>
            <Text style={styles.infoValue}>{otherFamily?.sharedAvailability.join(' · ') || 'No overlap yet'}</Text>
          </View>
        </View>
      </ScrollView>

      {canRespond ? (
        <View style={styles.footerStack}>
          <View style={styles.footer}>
            <Pressable
              style={[styles.declineButton, responding && styles.buttonDisabled]}
              onPress={() => respond('declined')}
              disabled={responding}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.acceptButton, responding && styles.buttonDisabled]}
              onPress={() => respond('accepted')}
              disabled={responding}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryButton} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      ) : canCancel ? (
        <View style={styles.footerStack}>
          <Pressable
            style={[styles.cancelButton, canceling && styles.buttonDisabled]}
            onPress={handleCancel}
            disabled={canceling}
          >
            <Text style={styles.cancelButtonText}>{canceling ? 'Cancelling…' : 'Cancel playdate'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable style={[styles.secondaryButton, styles.secondaryButtonFill]} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      )}

      <AddToGoogleCalendarPrompt
        visible={!!syncPromptProposalId}
        dateLabel={proposal.dateLabel}
        onClose={() => setSyncPromptProposalId(null)}
        onConfirm={() => addPlaydateToGoogleCalendar(syncPromptProposalId!)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
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
  backAlone: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
  },
  familiesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  familyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  familyCardPressable: {
    flex: 1,
  },
  familyPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  familyName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  familyLocation: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  kidsList: {
    marginTop: 10,
    gap: 6,
    width: '100%',
  },
  kidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kidPhoto: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  kidChipText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  emptyInline: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
  },
  connector: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  connectorScore: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  connectorScoreLabel: {
    fontSize: 8,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  tags: {
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  sitterPromo: {
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sitterPromoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sitterPromoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  sitterPromoText: {
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 18,
  },
  sitterPromoButton: {
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  sitterPromoButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
  },
  assignedSitterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  assignedSitterPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  assignedSitterInfo: {
    flex: 1,
  },
  assignedSitterName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  assignedSitterMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  sitterConfirmPill: {
    backgroundColor: colors.warningMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sitterConfirmPill_pending: {
    backgroundColor: colors.warningMuted,
  },
  sitterConfirmPill_confirmed: {
    backgroundColor: colors.positiveMuted,
  },
  sitterConfirmPill_declined: {
    backgroundColor: colors.errorMuted,
  },
  sitterConfirmPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  changeSitterLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 12,
  },
  infoRow: {
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
  },
  sharedExperienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sharedExperienceText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPill_accepted: {
    backgroundColor: '#DCF3E4',
  },
  statusPill_declined: {
    backgroundColor: '#F5DCDC',
  },
  statusPill_canceled: {
    backgroundColor: colors.border,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
  },
  footerStack: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  acceptButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  declineButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  cancelButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  // Only meaningful in `footer`'s row layout, where this is the sole child
  // and flex: 1 is what makes it fill the row's width — folded into
  // `secondaryButton` itself, `flex: 1` collapsed the button's text to
  // nothing on iOS whenever it was stacked in `footerStack`'s column
  // layout instead (flex: 1 there sizes along the column's main axis —
  // height — not width; React Native Web's browser-based flexbox handled
  // the same style forgivingly, which is why this never showed up there).
  secondaryButtonFill: {
    flex: 1,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
});
