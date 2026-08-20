import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { auth, db } from '../../lib/firebase';
import { connectGoogleCalendarBackend } from '../../lib/googleCalendar';
import { requestGoogleCalendarAuthCode } from '../../lib/googleIdentity';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

export default function Calendar() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleConnected, setGoogleConnected] = useState(profile.googleCalendarConnected);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [pushEvents, setPushEvents] = useState(profile.googleCalendarSyncEnabled);

  // wantsSync is passed explicitly rather than read from the pushEvents
  // state — the sync toggle's onValueChange calls this directly with the
  // value it's about to become, before that state update has actually
  // committed, so relying on the closure's current pushEvents would use the
  // stale, pre-toggle value.
  const handleConnectGoogle = async (wantsSync: boolean) => {
    setGoogleError(null);

    if (!auth?.currentUser) {
      setGoogleError('Your sign-in session has expired — log out and back in, then try Reconnect again.');
      return;
    }

    setConnectingGoogle(true);

    let code: string;
    try {
      code = await requestGoogleCalendarAuthCode(wantsSync);
    } catch (err: any) {
      // Chrome's Cross-Origin-Opener-Policy blocks Google's own internal
      // "is the popup still open" check, which can make it wrongly report
      // popup_closed_by_user even after a real, completed consent grant —
      // a false negative, not necessarily a real failure. One retry often
      // succeeds since the browser sometimes allows the check the second
      // time (timing-dependent, not something we can force reliably).
      if (err?.message?.includes('closed')) {
        setGoogleError(
          'Google reported the popup closed early, which can be a false alarm in some browsers — please try Connect again.'
        );
      } else {
        setGoogleError(`Couldn’t get Google’s permission (${err?.message ?? 'unknown error'}) — try again.`);
      }
      setConnectingGoogle(false);
      return;
    }

    try {
      await connectGoogleCalendarBackend(code);
      setGoogleConnected(true);
      setPushEvents(wantsSync);
      updateProfile({ googleCalendarConnected: true, googleCalendarSyncEnabled: wantsSync });
      saveOnboardingStep(
        { googleCalendarConnected: true, googleCalendarSyncEnabled: wantsSync },
        '/onboarding/calendar',
        { editMode }
      );
    } catch (err: any) {
      if (err?.code === 'functions/unauthenticated') {
        setGoogleError('Your sign-in session has expired — log out and back in, then try Reconnect again.');
      } else {
        setGoogleError(`Couldn’t save the connection (${err?.message ?? err?.code ?? 'unknown error'}) — try again.`);
      }
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Turning the toggle on needs the broader write-access scope, which only
  // a real Google consent grant can provide — so it runs the same Connect
  // flow the Reconnect button does, forced to write access, and only
  // actually flips (persisted, by handleConnectGoogle above) once that
  // succeeds. Turning it off needs no new permission — the family's
  // existing connection (whatever scope it has) is untouched, this just
  // stops the backend from attempting writes for them — so it saves
  // immediately instead of demanding another Google popup for something
  // that doesn't need one.
  const handleToggleSync = (value: boolean) => {
    if (!value) {
      setPushEvents(false);
      updateProfile({ googleCalendarSyncEnabled: false });
      saveOnboardingStep({ googleCalendarSyncEnabled: false }, '/onboarding/calendar', { editMode });
      return;
    }
    handleConnectGoogle(true);
  };

  const finish = async () => {
    setError(null);
    const uid = auth?.currentUser?.uid;
    if (!uid || !db) {
      setError('You need to be signed in to save your profile.');
      return;
    }

    setSubmitting(true);
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          ...profile,
          googleCalendarConnected: googleConnected,
          onboardingComplete: true,
          // Only stamp createdAt the first time onboarding actually finishes —
          // editing calendar settings afterward shouldn't reset it.
          ...(editMode ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
      router.replace(editMode ? '/profile' : '/(tabs)');
    } catch {
      setError('Couldn’t save your profile — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={10}
        title="Connect your"
        accent="calendar."
        backTo={editMode ? '/profile' : '/onboarding/availability'}
        editMode={editMode}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <View style={styles.noteHeader}>
            <Ionicons name="bulb-outline" size={18} color={colors.info} />
            <Text style={styles.noteTitle}>Let us do the scheduling work.</Text>
          </View>
          <Text style={styles.noteBody}>
            We match your free time with other families'. Other parents only ever see "free" or "busy" — never
            what's actually on your calendar.
          </Text>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.calendarName}>Google Calendar</Text>
            {connectingGoogle ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={styles.calendarActions}>
                {googleConnected && (
                  <View style={styles.connectedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                )}
                <Pressable style={styles.connectBadge} onPress={() => handleConnectGoogle(pushEvents)}>
                  <Image source={images.googleLogo} style={styles.brandIcon} />
                  <Text style={styles.connect}>{googleConnected ? 'Reconnect' : 'Connect'}</Text>
                </Pressable>
              </View>
            )}
          </View>
          <View style={styles.syncRow}>
            <View style={styles.syncTextWrap}>
              <Text style={styles.syncLabel}>Add accepted playdates to this calendar</Text>
              <Text style={styles.syncHint}>
                {pushEvents
                  ? 'Needs an extra Google permission — you may see an "unverified app" warning on connect; choose Advanced → Go to Haven.ly (unsafe) to continue.'
                  : "Off — we'll only check when you're free, never add anything to your calendar."}
              </Text>
            </View>
            <Switch value={pushEvents} onValueChange={handleToggleSync} disabled={connectingGoogle} />
          </View>
        </View>
        {googleError ? <Text style={styles.rowError}>{googleError}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={finish} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.ctaText}>{editMode ? 'Save changes' : 'Get Started'}</Text>
          )}
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
  content: {
    padding: 20,
    paddingTop: 0,
  },
  note: {
    backgroundColor: colors.infoMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  noteBody: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  calendarName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  syncTextWrap: {
    flex: 1,
  },
  syncLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  syncHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  connect: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  calendarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandIcon: {
    width: 16,
    height: 16,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.positive,
  },
  rowError: {
    fontSize: 12,
    color: colors.error,
    marginTop: -6,
    marginBottom: 10,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
    marginBottom: 4,
  },
  footer: {
    padding: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
