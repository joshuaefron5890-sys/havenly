import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddToGoogleCalendarPrompt } from '../../components/AddToGoogleCalendarPrompt';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { showAlert, showConfirm } from '../../lib/alert';
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
import {
  cancelProposal,
  PlaydateProposal,
  removeSitterFromPlaydate,
  respondToProposal,
  subscribeToProposal,
} from '../../lib/playdateProposals';
import { goBack } from '../../lib/navigation';
import { useIsDesktop } from '../../lib/responsive';
import { SITTERS_ENABLED } from '../../lib/sitters';
import { colors } from '../../theme/colors';

const SITTER_PROMO_IMAGE =
  'https://images.unsplash.com/photo-1585541993027-55373d67ea86?q=80&w=1658&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

const STATUS_LABEL: Record<PlaydateProposal['status'], string> = {
  proposed: 'Waiting for a response',
  accepted: 'Accepted',
  declined: 'Declined',
  canceled: 'Canceled',
};

// A second, louder status readout shown right under the two family photos
// (see statusBanner below) — the header's own statusPill answers the same
// question but sits in the top corner in a pale, easy-to-miss color; this
// answers "is this actually confirmed or still pending?" in plain words,
// right where someone's eye lands after the photos and before the date.
const STATUS_BANNER_LABEL: Record<PlaydateProposal['status'], string> = {
  proposed: 'Waiting for a response',
  accepted: 'Confirmed',
  declined: 'Declined',
  canceled: 'Canceled',
};
const STATUS_BANNER_ICON: Record<PlaydateProposal['status'], keyof typeof Ionicons.glyphMap> = {
  proposed: 'time-outline',
  accepted: 'checkmark-circle',
  declined: 'close-circle',
  canceled: 'close-circle-outline',
};

const SITTER_CONFIRM_LABEL: Record<NonNullable<PlaydateProposal['sitter']>['confirmationStatus'], string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

// A sitter's direct phone/email only appears once the playdate has
// actually arrived — comparing calendar dates (not exact timestamps) so
// it's visible any time that day, not just after the exact start time.
// Before then, "Change sitter" already covers the one thing a family
// might otherwise need contact info for (deciding whether to keep them).
function isDayOfOrAfter(dateIso: string): boolean {
  const playdateDay = new Date(dateIso);
  if (Number.isNaN(playdateDay.getTime())) return true;
  const today = new Date();
  return (
    playdateDay.getFullYear() < today.getFullYear() ||
    (playdateDay.getFullYear() === today.getFullYear() &&
      (playdateDay.getMonth() < today.getMonth() ||
        (playdateDay.getMonth() === today.getMonth() && playdateDay.getDate() <= today.getDate())))
  );
}

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
        iconSize={48}
      />
      <View style={styles.familyCardBody}>
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
  const isDesktop = useIsDesktop();
  const { user, familyUid, loading: authLoading } = useAuth();
  const [proposal, setProposal] = useState<PlaydateProposal | null | undefined>(undefined);
  const [otherFamily, setOtherFamily] = useState<FamilyProfile | null>(null);
  const [myFamily, setMyFamily] = useState<SuggestedFamily | null>(null);
  const [responding, setResponding] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [removingSitter, setRemovingSitter] = useState(false);

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

  // Confirm first, since this can't be undone from here — the family would
  // need to go back through "Find Help" and pick someone again (possibly
  // the same sitter) if they change their mind.
  const handleCancelSitter = async () => {
    if (!id || removingSitter) return;
    const confirmed = await showConfirm(
      'Cancel this sitter?',
      'They’ll be notified. You can add a sitter again later if you want.',
      'Cancel sitter'
    );
    if (!confirmed) return;
    setRemovingSitter(true);
    try {
      await removeSitterFromPlaydate(id);
    } catch (err: any) {
      showAlert('Couldn’t cancel the sitter', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setRemovingSitter(false);
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
        <Pressable style={styles.backAlone} onPress={() => goBack()}>
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
      <View style={[styles.header, isDesktop && styles.desktopColumn]}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Playdate</Text>
        <View style={[styles.statusPill, proposal.status !== 'proposed' && styles[`statusPill_${proposal.status}`]]}>
          <Text style={styles.statusPillText}>{STATUS_LABEL[proposal.status]}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.desktopColumn]}>
        <View style={styles.familiesRow}>
          <FamilyMini family={myFamily} fallbackLabel="You" />
          <FamilyMini
            family={otherFamily}
            fallbackLabel="…"
            onPress={otherUid ? () => router.push(`/family/${otherUid}`) : undefined}
          />
        </View>

        <View style={[styles.statusBanner, styles[`statusBanner_${proposal.status}`]]}>
          <Ionicons name={STATUS_BANNER_ICON[proposal.status]} size={18} color={colors.surface} />
          <Text style={styles.statusBannerText}>{STATUS_BANNER_LABEL[proposal.status]}</Text>
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
            <Text style={styles.cardLabel}>HELP FOR THIS PLAYDATE</Text>
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
            {isDayOfOrAfter(proposal.date) ? (
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
            ) : (
              <View style={styles.contactLocked}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
                <Text style={styles.contactLockedText}>Contact info unlocks the day of the playdate</Text>
              </View>
            )}
            <Pressable onPress={handleCancelSitter} disabled={removingSitter}>
              <Text style={styles.changeSitterLink}>{removingSitter ? 'Canceling…' : 'Cancel'}</Text>
            </Pressable>
          </View>
        ) : SITTERS_ENABLED && proposal.status === 'accepted' ? (
          <ImageBackground
            source={{ uri: SITTER_PROMO_IMAGE }}
            style={styles.sitterPromo}
            imageStyle={styles.sitterPromoImage}
          >
            <View style={styles.sitterPromoScrim} />
            <Text style={styles.sitterPromoTitle}>Want someone to help with the kids?</Text>
            <Text style={styles.sitterPromoText}>
              Bring in an experienced local sitter with an open slot for this exact time, so you can relax and
              connect with the other parents instead of watching the kids.
            </Text>
            <Pressable
              style={styles.sitterPromoButton}
              onPress={() => router.push(`/find-sitter?proposalId=${id}&date=${encodeURIComponent(proposal.date)}`)}
            >
              <Text style={styles.sitterPromoButtonText}>Find Help</Text>
            </Pressable>
          </ImageBackground>
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
        <View style={[styles.footerStack, isDesktop && styles.desktopColumn]}>
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
        <View style={[styles.footerStack, isDesktop && styles.footerRowDesktop, isDesktop && styles.desktopColumn]}>
          <Pressable
            style={[styles.cancelButton, isDesktop && styles.flexFill, canceling && styles.buttonDisabled]}
            onPress={handleCancel}
            disabled={canceling}
          >
            <Text style={styles.cancelButtonText}>{canceling ? 'Cancelling…' : 'Cancel playdate'}</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, isDesktop && styles.flexFill]} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.footer, isDesktop && styles.desktopColumn]}>
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
  // This is a single, focused detail screen rather than a nav-anchored
  // page — no sidebar makes sense here, so "desktop-friendly" just means
  // a comfortably wide, centered reading column instead of either edge-
  // to-edge full-browser-width text or the old fixed mobile column.
  desktopColumn: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  familiesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  familyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  familyCardPressable: {
    flex: 1,
  },
  // Full width and a real photo aspect ratio (not a small cropped circle)
  // — this is the one photo of each family shown on the whole screen, so
  // it gets to actually read as a photo. Landscape rather than portrait —
  // 4:5 (taller than wide) made this the dominant thing on the whole
  // screen; 3:2 keeps it clearly bigger than the old 56px circle without
  // dwarfing the date/venue/notes below. The card's own overflow:hidden
  // above clips its corners to match, no separate borderRadius needed here.
  familyPhoto: {
    width: '100%',
    aspectRatio: 3 / 2,
  },
  familyCardBody: {
    padding: 12,
    alignItems: 'center',
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
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
  },
  // Explicit width/height — without it the underlying <img> can render at
  // a collapsed size before layout stabilizes on web, which is what was
  // clipping the "Find Help" button below the fold (same fix already
  // needed on the provider-signup/onboarding hero panels).
  sitterPromoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  sitterPromoScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 24, 27, 0.55)',
  },
  sitterPromoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.surface,
    textAlign: 'center',
  },
  sitterPromoText: {
    fontSize: 13,
    color: colors.surface,
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
  contactLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  contactLockedText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
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
  // Solid color, not a pale tint — this is the one thing on the page meant
  // to answer "is this actually happening?" at a glance, so it needs to
  // read as a real status the way the pale statusPill up in the header
  // (kept as-is) doesn't quite manage to.
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  statusBanner_proposed: {
    backgroundColor: colors.warning,
  },
  statusBanner_accepted: {
    backgroundColor: colors.positive,
  },
  statusBanner_declined: {
    backgroundColor: colors.error,
  },
  statusBanner_canceled: {
    backgroundColor: colors.textMuted,
  },
  statusBannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
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
  // Side by side on desktop instead of stacked — there's plenty of spare
  // width in the wide column to not need the extra vertical space.
  footerRowDesktop: {
    flexDirection: 'row',
  },
  flexFill: {
    flex: 1,
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
