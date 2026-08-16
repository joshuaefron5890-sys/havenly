import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../components/Photo';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { longestPlaydateLengthHours, SuggestedSlot, suggestedPlaydateSlots } from '../lib/availabilityWindows';
import { signOutUser } from '../lib/firebase';
import { getGoogleFreeBusy } from '../lib/googleCalendar';
import { initials } from '../lib/initials';
import { numSiblings } from '../lib/onboardingFlow';
import { loadOnboardingProgress } from '../lib/onboardingProgress';
import { colors } from '../theme/colors';
import { images } from '../theme/images';
import { INTERESTS } from '../theme/interests';

function SectionCard({ title, editHref, children }: { title: string; editHref: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={() => router.push(editHref as any)} hitSlop={8}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
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

function TagText({ items }: { items: string[] }) {
  if (!items.length) return <Text style={styles.empty}>Not set yet</Text>;
  return <Text style={styles.fieldValue}>{items.join(', ')}</Text>;
}

function InterestGrid({ labels }: { labels: string[] }) {
  if (!labels.length) return <Text style={styles.empty}>Not set yet</Text>;
  const selected = INTERESTS.filter((interest) => labels.includes(interest.label));
  return (
    <View style={styles.interestGrid}>
      {selected.map((interest) => (
        <View key={interest.label} style={styles.interestTile}>
          <Photo source={interest.image} style={styles.interestThumb} />
          <Text style={styles.interestLabel}>{interest.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ConnectedBadge() {
  return (
    <View style={styles.connectedBadge}>
      <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
      <Text style={styles.connectedText}>Connected</Text>
    </View>
  );
}

function groupSlotsByDay(slots: SuggestedSlot[]): { dateLabel: string; slots: SuggestedSlot[] }[] {
  const groups: { dateLabel: string; slots: SuggestedSlot[] }[] = [];
  for (const slot of slots) {
    const dateLabel = slot.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const existing = groups.find((g) => g.dateLabel === dateLabel);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.push({ dateLabel, slots: [slot] });
    }
  }
  return groups;
}

function formatTimeRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { profile, updateProfile } = useOnboarding();
  const [hydrating, setHydrating] = useState(true);
  // The Google account photo URL can fail to load (expired, blocked by
  // referrer policy, etc.) — React Native Web then renders a broken-image
  // icon instead of quietly falling back, so track load failures ourselves.
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Unlike the onboarding screens, this route isn't behind onboarding/_layout's
  // hydration gate, so OnboardingContext would otherwise still be empty
  // defaults here — load the saved profile the same way onboarding does.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // A stale/expired session left this route rendering as if signed in
      // (e.g. after a page refresh) — send back to sign-in instead of
      // showing a profile screen with nothing real behind it.
      router.replace('/sign-in');
      return;
    }
    let cancelled = false;
    loadOnboardingProgress(user.uid)
      .then((progress) => {
        if (cancelled) return;
        if (progress && Object.keys(progress.profile).length) {
          updateProfile(progress.profile);
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  const [slots, setSlots] = useState<SuggestedSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  // 'ok'/'needs-reconnect' reflect whether the stored connection actually
  // works, independent of whether the user has picked any preferred times
  // yet — the Calendar card below shows this even with no availability set.
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<'idle' | 'checking' | 'ok' | 'needs-reconnect' | 'error'>(
    'idle'
  );

  const playdateLengthHours = longestPlaydateLengthHours(profile.children.map((c) => c.idealPlaydateLength));
  const daysAhead = 21;

  // Verifies the real, live Google Calendar connection (a googleCalendarConnected:
  // true flag in Firestore doesn't guarantee a working stored refresh token —
  // e.g. one saved before the backend function existed) and, if it works,
  // finds concrete open slots — sized to the longest child's preferred
  // playdate length — within the preferred playdate windows from onboarding,
  // over the next three weeks.
  useEffect(() => {
    if (hydrating) return;
    if (!profile.googleCalendarConnected) {
      setGoogleCalendarStatus('idle');
      setSlots(null);
      return;
    }
    let cancelled = false;
    setGoogleCalendarStatus('checking');
    setSlotsError(null);
    const now = new Date();
    // +1 day of headroom — suggestedPlaydateSlots looks from tomorrow
    // through daysAhead days out, one day later than a plain now+daysAhead
    // would cover.
    const rangeEnd = new Date(now.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);
    getGoogleFreeBusy(now.toISOString(), rangeEnd.toISOString())
      .then((busy) => {
        if (cancelled) return;
        setGoogleCalendarStatus('ok');
        setSlots(
          profile.availability.length
            ? suggestedPlaydateSlots(profile.availability, busy, playdateLengthHours, daysAhead)
            : []
        );
      })
      .catch((err: any) => {
        if (cancelled) return;
        if (err?.code === 'functions/failed-precondition') {
          setGoogleCalendarStatus('needs-reconnect');
        } else {
          setGoogleCalendarStatus('error');
          setSlotsError(`Couldn’t check your calendar right now — try again later. (${err?.message ?? err?.code ?? 'unknown error'})`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrating, profile.googleCalendarConnected, profile.availability.length, playdateLengthHours]);

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

  if (authLoading || hydrating) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const siblingCount = numSiblings({
    numChildren: profile.numChildren,
    numNeurodivergentChildren: profile.numNeurodivergentChildren,
  });
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          {user?.photoURL && !avatarFailed ? (
            <Image
              source={{ uri: user.photoURL }}
              style={styles.avatar}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{initials(user?.displayName, user?.email)}</Text>
            </View>
          )}
          <Text style={styles.name}>{fullName || user?.displayName || 'Your account'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <SectionCard title="Account" editHref="/onboarding/account?edit=1">
          <Field label="Name" value={fullName} />
          <Field label="Pronouns" value={profile.pronouns ?? ''} />
        </SectionCard>

        <SectionCard title="Family" editHref="/onboarding/family?edit=1">
          {profile.familyPhotoUrl ? <Photo source={{ uri: profile.familyPhotoUrl }} style={styles.familyPhoto} /> : null}
          <Field
            label="Children"
            value={`${profile.numChildren} total · ${profile.numNeurodivergentChildren} neurodivergent`}
          />
          <Field
            label="Partner or co-parent at home"
            value={profile.partnerAtHome == null ? '' : profile.partnerAtHome ? 'Yes' : 'No'}
          />
          <Field label="Siblings usually included" value={profile.siblingsIncluded ?? ''} />
        </SectionCard>

        {profile.children.length > 0 && (
          <SectionCard
            title={profile.children.length > 1 ? 'Neurodivergent children' : 'Neurodivergent child'}
            editHref="/onboarding/child?edit=1"
          >
            {profile.children.map((child, i) => (
              <View key={i} style={styles.personRow}>
                <Photo source={child.photoUrl ? { uri: child.photoUrl } : undefined} style={styles.personPhoto} />
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{child.name || `Child ${i + 1}`}</Text>
                  <Text style={styles.personMeta}>
                    {[child.age && `Age ${child.age}`, child.grade].filter(Boolean).join(' · ') || 'No details yet'}
                  </Text>
                  {child.neurodivergence.length > 0 ? <TagText items={child.neurodivergence} /> : null}
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {siblingCount > 0 && profile.siblingProfiles.length > 0 && (
          <SectionCard
            title={profile.siblingProfiles.length > 1 ? 'Siblings' : 'Sibling'}
            editHref="/onboarding/siblings?edit=1"
          >
            {profile.siblingProfiles.map((sibling, i) => (
              <View key={i} style={styles.personRow}>
                <Photo source={sibling.photoUrl ? { uri: sibling.photoUrl } : undefined} style={styles.personPhoto} />
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{sibling.name || `Sibling ${i + 1}`}</Text>
                  <Text style={styles.personMeta}>
                    {[sibling.age && `Age ${sibling.age}`, sibling.gender, sibling.grade].filter(Boolean).join(' · ') ||
                      'No details yet'}
                  </Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {profile.children.length > 0 && (
          <SectionCard title="Play style" editHref="/onboarding/play-style?edit=1">
            {profile.children.map((child, i) => (
              <View key={i} style={i > 0 && styles.playStyleBlock}>
                {profile.children.length > 1 ? (
                  <Text style={styles.personName}>{child.name || `Child ${i + 1}`}</Text>
                ) : null}
                <TagText items={child.playStyle} />
                <Field label="Ideal playdate length" value={child.idealPlaydateLength ?? ''} />
              </View>
            ))}
          </SectionCard>
        )}

        <SectionCard title="Interests" editHref="/onboarding/interests?edit=1">
          <InterestGrid labels={profile.interests} />
        </SectionCard>

        <SectionCard title="Goals" editHref="/onboarding/goals?edit=1">
          <TagText items={profile.goals} />
        </SectionCard>

        <SectionCard title="About you" editHref="/onboarding/about-you?edit=1">
          <Field label="At a get-together, you're usually..." value={profile.personality ?? ''} />
          <Text style={styles.fieldLabel}>What sounds good to you</Text>
          <TagText items={profile.soundsGoodTo} />
        </SectionCard>

        <SectionCard title="Availability" editHref="/onboarding/availability?edit=1">
          <TagText items={profile.availability} />
        </SectionCard>

        <SectionCard title="Calendar" editHref="/onboarding/calendar?edit=1">
          <View style={styles.calendarRow}>
            <View style={styles.calendarLabel}>
              <Image source={images.googleLogo} style={styles.brandIcon} />
              <Text style={styles.fieldValue}>Google Calendar</Text>
            </View>
            {!profile.googleCalendarConnected ? (
              <Text style={styles.empty}>Not connected</Text>
            ) : googleCalendarStatus === 'checking' ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : googleCalendarStatus === 'needs-reconnect' ? (
              <View style={styles.connectedBadge}>
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.needsReconnectText}>Needs reconnection</Text>
              </View>
            ) : (
              <ConnectedBadge />
            )}
          </View>
          <View style={styles.calendarRow}>
            <View style={styles.calendarLabel}>
              <Ionicons name="logo-apple" size={16} color={colors.text} />
              <Text style={styles.fieldValue}>Apple Calendar</Text>
            </View>
            {profile.appleCalendarConnected ? <ConnectedBadge /> : <Text style={styles.empty}>Not connected</Text>}
          </View>
        </SectionCard>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My playdate availability</Text>
          <Text style={styles.availabilitySubtitle}>
            Open slots over the next 3 weeks, sized to your preferred playdate length
            ({playdateLengthHours % 1 === 0 ? playdateLengthHours : playdateLengthHours.toFixed(1)}h) and checked
            against your connected calendar.
          </Text>
          {!profile.googleCalendarConnected ? (
            <Text style={styles.empty}>Connect Google Calendar above to see this.</Text>
          ) : googleCalendarStatus === 'checking' ? (
            <ActivityIndicator color={colors.accent} />
          ) : googleCalendarStatus === 'needs-reconnect' ? (
            <Text style={styles.availabilityError}>
              Your Google Calendar connection needs to be refreshed — reconnect it above.
            </Text>
          ) : googleCalendarStatus === 'error' ? (
            <Text style={styles.availabilityError}>{slotsError}</Text>
          ) : profile.availability.length === 0 ? (
            <Text style={styles.empty}>Set your preferred playdate times to see this.</Text>
          ) : !slots || slots.length === 0 ? (
            <Text style={styles.empty}>No open slots long enough in the next 3 weeks.</Text>
          ) : (
            groupSlotsByDay(slots).map((group) => (
              <View key={group.dateLabel} style={styles.availabilityDay}>
                <Text style={styles.availabilityDate}>{group.dateLabel}</Text>
                {group.slots.map((slot) => (
                  <View key={slot.start.toISOString()} style={styles.availabilitySlotRow}>
                    <Text style={styles.fieldValue}>{formatTimeRange(slot.start, slot.end)}</Text>
                    <Text style={styles.availabilityWindowLabel}>{slot.label}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.logoutButton} onPress={logOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} style={styles.logoutIcon} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
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
    paddingBottom: 40,
  },
  identity: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  editLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  familyPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: colors.accentMuted,
  },
  field: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    color: colors.text,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  interestTile: {
    width: 64,
    alignItems: 'center',
  },
  interestThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    marginBottom: 4,
  },
  interestLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  calendarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    width: 16,
    height: 16,
  },
  personRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  personPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentMuted,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  personMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
  },
  playStyleBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.positive,
  },
  needsReconnectText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
  },
  availabilitySubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 14,
  },
  availabilityError: {
    fontSize: 13,
    color: colors.error,
  },
  availabilityDay: {
    marginBottom: 14,
  },
  availabilityDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  availabilitySlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  availabilityWindowLabel: {
    fontSize: 12,
    color: colors.textMuted,
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
    marginTop: 8,
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
