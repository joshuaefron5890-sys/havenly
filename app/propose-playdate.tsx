import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '../lib/navigation';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { FieldInput } from '../components/FieldInput';
import { useOnboarding } from '../contexts/OnboardingContext';
import { showAlert } from '../lib/alert';
import { longestPlaydateLengthHours, SuggestedSlot, suggestedPlaydateSlots } from '../lib/availabilityWindows';
import { familyDisplayName, FamilyProfile, fetchFamilyProfile } from '../lib/families';
import { getGoogleFreeBusy } from '../lib/googleCalendar';
import { createPlaydateProposal } from '../lib/playdateProposals';
import { colors } from '../theme/colors';

function formatSlotLabel(slot: SuggestedSlot): string {
  const dateLabel = slot.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${dateLabel} · ${slot.start.toLocaleTimeString(undefined, timeOpts)}–${slot.end.toLocaleTimeString(undefined, timeOpts)}`;
}

export default function ProposePlaydate() {
  const { familyId } = useLocalSearchParams<{ familyId: string }>();
  const { profile: myProfile } = useOnboarding();
  const [targetProfile, setTargetProfile] = useState<FamilyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SuggestedSlot[] | null>(null);
  const [slotsNote, setSlotsNote] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SuggestedSlot | null>(null);
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    fetchFamilyProfile(familyId)
      .then((result) => {
        if (!cancelled) setTargetProfile(result);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  // Candidate slots are restricted to windows BOTH families said work
  // (targetProfile.sharedAvailability, already computed server-side as the
  // intersection) — checked against the proposer's own real calendar
  // conflicts the same way profile.tsx's "My playdate availability" does.
  // There's no way to check the other family's calendar (that's private to
  // them), so this is "times that work for both of you, that are also
  // actually free on my end" rather than a true two-sided free/busy merge.
  useEffect(() => {
    if (!targetProfile) return;
    if (!targetProfile.sharedAvailability.length) {
      setSlots([]);
      setSlotsNote('You and this family haven’t marked any of the same availability windows yet.');
      return;
    }
    let cancelled = false;
    const durationHours = longestPlaydateLengthHours(myProfile.children.map((c) => c.idealPlaydateLength));
    const now = new Date();
    const rangeEnd = new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000);

    if (!myProfile.googleCalendarConnected) {
      setSlots(suggestedPlaydateSlots(targetProfile.sharedAvailability, [], durationHours, 21));
      setSlotsNote('Connect Google Calendar in your profile to check these against real conflicts.');
      return;
    }
    getGoogleFreeBusy(now.toISOString(), rangeEnd.toISOString())
      .then((busy) => {
        if (cancelled) return;
        setSlots(suggestedPlaydateSlots(targetProfile.sharedAvailability, busy, durationHours, 21));
        setSlotsNote(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots(suggestedPlaydateSlots(targetProfile.sharedAvailability, [], durationHours, 21));
        setSlotsNote('Couldn’t check your calendar for conflicts — showing your shared windows anyway.');
      });
    return () => {
      cancelled = true;
    };
  }, [targetProfile, myProfile.children, myProfile.googleCalendarConnected]);

  const handleSubmit = async () => {
    if (!familyId || !selectedSlot || !venue.trim() || submitting) return;
    setSubmitting(true);
    try {
      const conversationId = await createPlaydateProposal(
        familyId,
        {
          date: selectedSlot.start.toISOString(),
          endDate: selectedSlot.end.toISOString(),
          dateLabel: formatSlotLabel(selectedSlot),
          windowLabel: selectedSlot.label,
          venue: venue.trim(),
        },
        note
      );
      router.replace(`/messages/${conversationId}`);
    } catch (err: any) {
      showAlert('Couldn’t send that proposal', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <EmptyState text={`Couldn’t load this family (${error}).`} />
        </View>
      </SafeAreaView>
    );
  }

  if (!targetProfile) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const canSubmit = Boolean(selectedSlot && venue.trim() && !submitting);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Propose a playdate</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subhead}>with {familyDisplayName(targetProfile)}</Text>

          <Text style={styles.label}>PICK A TIME</Text>
          {slotsNote ? <Text style={styles.note}>{slotsNote}</Text> : null}
          {slots === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : slots.length === 0 ? (
            <EmptyState text="No overlapping times found in the next 3 weeks." />
          ) : (
            slots.slice(0, 12).map((slot) => {
              const selected = selectedSlot?.start.getTime() === slot.start.getTime();
              return (
                <Pressable
                  key={slot.start.toISOString()}
                  style={[styles.slotRow, selected && styles.slotRowSelected]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <View style={styles.slotTextWrap}>
                    <Text style={styles.slotText}>{formatSlotLabel(slot)}</Text>
                    <Text style={styles.slotWindowLabel}>{slot.label}</Text>
                  </View>
                </Pressable>
              );
            })
          )}

          <FieldInput label="Venue" placeholder="Address or place name" value={venue} onChangeText={setVenue} />

          <Text style={styles.label}>
            MESSAGE<Text style={styles.optional}> · optional</Text>
          </Text>
          <TextInput
            style={styles.messageInput}
            placeholder="Add a note about the playdate…"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.cta, !canSubmit && styles.ctaDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
            <Text style={styles.ctaText}>{submitting ? 'Sending…' : 'Send proposal'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
    paddingTop: 0,
  },
  subhead: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
  },
  note: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 10,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  slotRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  slotTextWrap: {
    flex: 1,
  },
  slotText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  slotWindowLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  footer: {
    padding: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
