import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { auth, firebaseConfigured, googleSignInSupported, signInWithGoogleIdToken } from '../../lib/firebase';
import { exchangeGoogleSignInCode, saveGoogleCalendarRefreshToken } from '../../lib/googleCalendar';
import { requestGoogleSignInWithCalendarCode } from '../../lib/googleIdentity';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'];

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with that email already exists — try signing in instead.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    default:
      return 'Something went wrong creating your account. Please try again.';
  }
}

function friendlyGoogleError(reason: string): string | null {
  switch (reason) {
    case 'popup_closed':
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/unauthorized-domain':
      return 'This site isn’t authorized for Google sign-in yet — add it under Firebase Auth → Settings → Authorized domains.';
    default:
      return `Something went wrong signing up with Gmail (${reason || 'unknown error'}) — please try again.`;
  }
}

export default function Account() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { user, loading: authLoading } = useAuth();
  const { profile, updateProfile: updateOnboardingProfile } = useOnboarding();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(profile.pronouns);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [connectedGmail, setConnectedGmail] = useState<string | null>(null);

  // auth.currentUser isn't populated synchronously on a fresh page load —
  // Firebase restores the session from storage asynchronously, so this has
  // to react to the auth context settling rather than check it once at
  // mount (which, on a refresh, would almost always still read as signed out).
  useEffect(() => {
    if (authLoading) return;
    const isGoogleUser = user?.providerData.some((p) => p.providerId === 'google.com');
    setConnectedGmail(isGoogleUser ? (user?.email ?? null) : null);
  }, [authLoading, user]);

  const handleContinue = async () => {
    setError(null);
    if (!firstName || !lastName) {
      setError('Add your first and last name to continue.');
      return;
    }

    if (connectedGmail || editMode) {
      updateOnboardingProfile({ firstName, lastName, pronouns: pronoun });
      saveOnboardingStep({ firstName, lastName, pronouns: pronoun }, '/onboarding/family');
      router.replace(editMode ? '/profile' : '/onboarding/family');
      return;
    }

    if (!email || !password) {
      setError('Fill in your email and password to continue.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    if (!firebaseConfigured || !auth) {
      setError('Sign-up isn’t configured yet — the app is missing its backend credentials.');
      return;
    }

    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: `${firstName} ${lastName}`.trim() });
      updateOnboardingProfile({ firstName, lastName, pronouns: pronoun });
      saveOnboardingStep({ firstName, lastName, pronouns: pronoun }, '/onboarding/family');
      router.push('/onboarding/family');
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-up isn’t configured yet — the app is missing its backend credentials.');
      return;
    }
    if (!googleSignInSupported()) {
      setError('Sign up with Gmail isn’t available on this platform yet — use email for now.');
      return;
    }

    setGoogleSubmitting(true);
    try {
      const code = await requestGoogleSignInWithCalendarCode();
      const { idToken, accessToken, refreshToken } = await exchangeGoogleSignInCode(code);
      const credential = await signInWithGoogleIdToken(idToken, accessToken);
      if (refreshToken) {
        // Best-effort — a brand-new account should never be blocked on this;
        // worst case they just see "Needs reconnection" later and can retry.
        try {
          await saveGoogleCalendarRefreshToken(refreshToken);
          updateOnboardingProfile({ googleCalendarConnected: true });
        } catch {
          // ignore — calendar connection isn't required to finish sign-up
        }
      }
      const [first, ...rest] = (credential.user.displayName ?? '').split(' ');
      setFirstName(first ?? '');
      setLastName(rest.join(' '));
      setConnectedGmail(credential.user.email);
    } catch (err: any) {
      const message = friendlyGoogleError(err?.message ?? err?.code ?? '');
      if (message) setError(message);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={1}
        title={editMode ? 'Edit your' : 'Create your'}
        accent="account."
        backTo={editMode ? '/profile' : undefined}
        editMode={editMode}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.half}>
            <FieldInput label="First name" placeholder="Jamie" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={styles.half}>
            <FieldInput label="Last name" placeholder="Chen" value={lastName} onChangeText={setLastName} />
          </View>
        </View>
        {connectedGmail ? (
          <View style={styles.connectedRow}>
            <Ionicons name="checkmark-circle" size={22} color={colors.positive} />
            <View style={styles.connectedTextWrap}>
              <Text style={styles.connectedTitle}>Connected with Gmail</Text>
              <Text style={styles.connectedEmail}>{connectedGmail}</Text>
            </View>
          </View>
        ) : editMode ? (
          <View style={styles.connectedRow}>
            <Ionicons name="mail-outline" size={22} color={colors.positive} />
            <View style={styles.connectedTextWrap}>
              <Text style={styles.connectedTitle}>Signed in</Text>
              <Text style={styles.connectedEmail}>{user?.email}</Text>
            </View>
          </View>
        ) : (
          <>
            <FieldInput
              label="Email"
              placeholder="jamie@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FieldInput
              label="Password"
              placeholder="6+ characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </>
        )}

        <Text style={styles.label}>
          PRONOUNS<Text style={styles.optional}> · optional</Text>
        </Text>
        <View style={styles.chips}>
          {PRONOUNS.map((p) => (
            <Chip key={p} label={p} selected={pronoun === p} onPress={() => setPronoun(p)} />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleContinue} disabled={submitting}>
          <Text style={styles.ctaText}>{submitting ? 'Creating account…' : editMode ? 'Save changes' : 'Continue'}</Text>
        </Pressable>
        {!connectedGmail && !editMode && (
          <Pressable
            style={[styles.googleButton, googleSubmitting && styles.ctaDisabled]}
            onPress={handleGoogleSignUp}
            disabled={googleSubmitting}
          >
            <Ionicons name="logo-google" size={18} color={colors.text} style={styles.googleIcon} />
            <Text style={styles.googleText}>{googleSubmitting ? 'Signing up…' : 'Sign up with Gmail'}</Text>
          </Pressable>
        )}
      </View>
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
  content: {
    padding: 20,
    paddingTop: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.positiveMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  connectedTextWrap: {
    flex: 1,
  },
  connectedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  connectedEmail: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 16,
  },
  footer: {
    padding: 20,
    gap: 10,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  googleButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 8,
  },
  googleText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
