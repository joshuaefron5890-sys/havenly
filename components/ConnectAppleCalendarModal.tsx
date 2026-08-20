import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet } from 'react-native';
import { Text } from './AppText';
import { FieldInput } from './FieldInput';
import { useOnboarding } from '../contexts/OnboardingContext';
import { connectAppleCalendar } from '../lib/appleCalendar';
import { saveOnboardingStep } from '../lib/onboardingProgress';
import { colors } from '../theme/colors';

// The Apple Calendar connect form — shared between app/onboarding/calendar.tsx
// (part of the wizard) and app/profile.tsx (so connecting isn't onboarding-only;
// previously the Profile screen could only ever *show* connection status, with
// no way to actually connect from there).
export function ConnectAppleCalendarModal({
  visible,
  onClose,
  onConnected,
  editMode = true,
}: {
  visible: boolean;
  onClose: () => void;
  // Fires after a successful connect, before the modal closes — lets a
  // caller with its own "connected" state (e.g. onboarding's finish() step)
  // stay in sync with what just got saved.
  onConnected?: () => void;
  // Passed straight through to saveOnboardingStep — true (the default) for
  // any caller outside the initial onboarding wizard itself, since that's
  // the one place a *new* profile is still being built.
  editMode?: boolean;
}) {
  const { updateProfile } = useOnboarding();
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (connecting) return;
    onClose();
    setError(null);
  };

  const handleConnect = async () => {
    setError(null);
    if (!appleId.trim() || !appPassword.trim()) {
      setError('Enter your Apple ID and an app-specific password.');
      return;
    }
    setConnecting(true);
    try {
      await connectAppleCalendar(appleId.trim(), appPassword.trim());
      updateProfile({ appleCalendarConnected: true });
      await saveOnboardingStep({ appleCalendarConnected: true }, '/onboarding/calendar', { editMode });
      setAppleId('');
      setAppPassword('');
      onConnected?.();
      onClose();
    } catch {
      setError('Couldn’t verify your Apple ID and app-specific password — double check them and try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Connect Apple Calendar</Text>
          <Text style={styles.body}>
            Use an app-specific password, not your regular Apple ID password.{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://appleid.apple.com/account/manage')}>
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.cta, connecting && styles.ctaDisabled]} onPress={handleConnect} disabled={connecting}>
            {connecting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Connect</Text>}
          </Pressable>
          <Pressable onPress={close}>
            <Text style={styles.skip}>Cancel</Text>
          </Pressable>
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
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 16,
  },
  link: {
    color: colors.accent,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
    marginBottom: 4,
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
