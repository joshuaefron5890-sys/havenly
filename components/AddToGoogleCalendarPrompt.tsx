import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet } from 'react-native';
import { Text } from './AppText';
import { useOnboarding } from '../contexts/OnboardingContext';
import { connectGoogleCalendarBackend } from '../lib/googleCalendar';
import { requestGoogleCalendarAuthCode } from '../lib/googleIdentity';
import { saveOnboardingStep } from '../lib/onboardingProgress';
import { colors } from '../theme/colors';

// Runs the Connect flow (write-access scope) and then hands off to
// `onConfirm` to actually create the one calendar event this was shown
// for — the caller supplies that last step since what's being added
// differs (a playdate proposal vs. a nearby-events-feed event), while the
// connect flow itself is identical either way.
//
// Shared between app/proposal/[id].tsx, app/messages/[id].tsx (playdates —
// the two places a proposal can actually be accepted from, living in only
// one of them was the original bug here: accepting from a message thread
// silently skipped both this prompt and the automatic trigger, with no
// visible error either way) and app/event/[id].tsx (its own "Add to My
// Calendar" button, unrelated to any accept-time trigger).
export function AddToGoogleCalendarPrompt({
  visible,
  dateLabel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  dateLabel: string;
  onClose: () => void;
  // Creates the actual calendar event once Connect has succeeded — throw
  // to surface an error in this same modal.
  onConfirm: () => Promise<void>;
}) {
  const { updateProfile } = useOnboarding();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);

  const addToGoogleCalendar = async () => {
    setSyncError(null);
    setSyncing(true);

    let code: string;
    try {
      code = await requestGoogleCalendarAuthCode(true);
    } catch (err: any) {
      setSyncError(
        err?.message?.includes('closed')
          ? 'Google reported the popup closed early, which can be a false alarm — please try again.'
          : `Couldn’t get Google’s permission (${err?.message ?? 'unknown error'}).`
      );
      setSyncing(false);
      return;
    }

    try {
      await connectGoogleCalendarBackend(code);
      updateProfile({ googleCalendarConnected: true, googleCalendarSyncEnabled: true });
      await saveOnboardingStep(
        { googleCalendarConnected: true, googleCalendarSyncEnabled: true },
        '/onboarding/calendar',
        { editMode: true }
      );
      await onConfirm();
      setSyncDone(true);
    } catch (err: any) {
      setSyncError(`Couldn’t add this to your calendar (${err?.message ?? err?.code ?? 'unknown error'}).`);
    } finally {
      setSyncing(false);
    }
  };

  const close = () => {
    if (syncing) return;
    onClose();
    setSyncError(null);
    setSyncDone(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          {syncDone ? (
            <>
              <Ionicons name="checkmark-circle" size={32} color={colors.positive} />
              <Text style={styles.title}>Added to your Google Calendar</Text>
              <Pressable style={styles.cta} onPress={close}>
                <Text style={styles.ctaText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Add this playdate to your Google Calendar?</Text>
              <Text style={styles.body}>
                We’ll create an event for {dateLabel}. Google may show an “unverified app” warning first — choose
                Advanced, then “Go to Haven.ly (unsafe)”, to continue.
              </Text>
              {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
              <Pressable
                style={[styles.cta, syncing && styles.ctaDisabled]}
                onPress={addToGoogleCalendar}
                disabled={syncing}
              >
                {syncing ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Yes, add it</Text>}
              </Pressable>
              <Pressable onPress={close}>
                <Text style={styles.skip}>Not now</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  error: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 12,
  },
  cta: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  skip: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
