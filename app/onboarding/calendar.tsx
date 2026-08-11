import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { connectAppleCalendar } from '../../lib/appleCalendar';
import { auth, db } from '../../lib/firebase';
import { verifyGoogleCalendarAccess } from '../../lib/googleCalendar';
import { requestGoogleCalendarAccessToken } from '../../lib/googleIdentity';
import { colors } from '../../theme/colors';

export default function Calendar() {
  const { profile } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleConnected, setGoogleConnected] = useState(profile.googleCalendarConnected);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [appleConnected, setAppleConnected] = useState(profile.appleCalendarConnected);
  const [appleModalVisible, setAppleModalVisible] = useState(false);
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [connectingApple, setConnectingApple] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  const handleConnectGoogle = async () => {
    setGoogleError(null);
    setConnectingGoogle(true);
    try {
      const accessToken = await requestGoogleCalendarAccessToken();
      await verifyGoogleCalendarAccess(accessToken);
      setGoogleConnected(true);
    } catch {
      setGoogleError('Couldn’t connect Google Calendar — try again.');
    } finally {
      setConnectingGoogle(false);
    }
  };

  const openAppleModal = () => {
    setAppleError(null);
    setAppleModalVisible(true);
  };

  const handleConnectApple = async () => {
    setAppleError(null);
    if (!appleId.trim() || !appPassword.trim()) {
      setAppleError('Enter your Apple ID and an app-specific password.');
      return;
    }
    setConnectingApple(true);
    try {
      await connectAppleCalendar(appleId.trim(), appPassword.trim());
      setAppleConnected(true);
      setAppleModalVisible(false);
      setAppleId('');
      setAppPassword('');
    } catch {
      setAppleError('Couldn’t verify your Apple ID and app-specific password — double check them and try again.');
    } finally {
      setConnectingApple(false);
    }
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
          appleCalendarConnected: appleConnected,
          onboardingComplete: true,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      router.replace('/onboarding/matches');
    } catch {
      setError('Couldn’t save your profile — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={10} title="Connect your" accent="calendar." backTo="/onboarding/availability" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Let us do the scheduling work.</Text>
          <Text style={styles.noteBody}>
            We match your free time with other families'. Other parents only ever see "free" or "busy" — never
            what's actually on your calendar.
          </Text>
        </View>

        <View style={styles.calendarRow}>
          <Text style={styles.calendarName}>Google Calendar</Text>
          {connectingGoogle ? (
            <ActivityIndicator color={colors.accent} />
          ) : googleConnected ? (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          ) : (
            <Pressable style={styles.connectBadge} onPress={handleConnectGoogle}>
              <Ionicons name="link-outline" size={16} color={colors.accent} />
              <Text style={styles.connect}>Connect</Text>
            </Pressable>
          )}
        </View>
        {googleError ? <Text style={styles.rowError}>{googleError}</Text> : null}

        <View style={styles.calendarRow}>
          <Text style={styles.calendarName}>Apple Calendar</Text>
          {appleConnected ? (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          ) : (
            <Pressable style={styles.connectBadge} onPress={openAppleModal}>
              <Ionicons name="link-outline" size={16} color={colors.accent} />
              <Text style={styles.connect}>Connect</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.calendarRow}>
          <Text style={styles.calendarName}>Outlook Calendar</Text>
          <View style={styles.connectBadge}>
            <Ionicons name="link-outline" size={16} color={colors.accent} />
            <Text style={styles.connect}>Connect</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Modal visible={appleModalVisible} transparent animationType="fade" onRequestClose={() => setAppleModalVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => !connectingApple && setAppleModalVisible(false)}>
          <Pressable style={styles.appleCard} onPress={() => {}}>
            <Text style={styles.appleTitle}>Connect Apple Calendar</Text>
            <Text style={styles.appleBody}>
              Use an app-specific password, not your regular Apple ID password.{' '}
              <Text
                style={styles.appleLink}
                onPress={() => Linking.openURL('https://appleid.apple.com/account/manage')}
              >
                Generate one at appleid.apple.com
              </Text>
              .
            </Text>
            <FieldInput
              label="Apple ID"
              placeholder="you@icloud.com"
              value={appleId}
              onChangeText={setAppleId}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <FieldInput
              label="App-specific password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              value={appPassword}
              onChangeText={setAppPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            {appleError ? <Text style={styles.error}>{appleError}</Text> : null}
            <Pressable
              style={[styles.cta, connectingApple && styles.ctaDisabled]}
              onPress={handleConnectApple}
              disabled={connectingApple}
            >
              {connectingApple ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Connect</Text>}
            </Pressable>
            <Pressable onPress={() => !connectingApple && setAppleModalVisible(false)}>
              <Text style={styles.skip}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={finish} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Find My Matches</Text>}
        </Pressable>
        <Pressable onPress={finish} disabled={submitting}>
          <Text style={styles.skip}>Skip for now</Text>
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
    backgroundColor: colors.accentMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  calendarName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  connect: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  connectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  appleCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
  },
  appleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  appleBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 16,
  },
  appleLink: {
    color: colors.accent,
    fontWeight: '600',
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
  skip: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
});
