import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { FieldInput } from '../../components/FieldInput';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { WizardHeader } from '../../components/WizardHeader';
import { useAuth } from '../../contexts/AuthContext';
import { auth, firebaseConfigured, signInWithGoogleIdToken } from '../../lib/firebase';
import { fetchMySitterProfile, saveMySitterProfile } from '../../lib/sitters';
import { colors } from '../../theme/colors';

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

function splitName(name: string): [string, string] {
  const [first, ...rest] = name.trim().split(/\s+/);
  return [first ?? '', rest.join(' ')];
}

// Step 1 of 3 — mirrors app/onboarding/account.tsx's own account-creation
// step (same first/last name split, same Google sign-in option) rather
// than a sitter-specific layout. The photo picker lives on step 2 instead
// — account creation itself doesn't need it, and every other field here
// (name/email/password) is exactly what onboarding/account.tsx collects
// too. A visitor who already has an account (resumed via back-navigation,
// or a returning sitter whose earlier session got this far) sees a
// "connected" state instead of the signup form — same reasoning as that
// screen's connectedGmail branch.
export default function SitterSignupAccount() {
  // Carried over from the providers splash page's interest-list form, if
  // that's where this visit came from (via /provider-signup's redirect —
  // see that file). zip has nowhere to show yet (that's step 3), so it
  // rides along silently in the saved profile and step 3 picks it up
  // from there.
  const { name: prefillName, zip: prefillZip } = useLocalSearchParams<{ name?: string; zip?: string }>();
  const { user, loading: authLoading } = useAuth();
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [prefillFirst, prefillLast] = splitName(prefillName ?? '');
  const [firstName, setFirstName] = useState(prefillFirst);
  const [lastName, setLastName] = useState(prefillLast);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const connected = Boolean(user);

  // Already has an account (see the doc comment above) — hydrate whatever
  // was saved in step 1 last time, so re-entering here doesn't look like
  // starting over.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoadingExisting(false);
      return;
    }
    let cancelled = false;
    fetchMySitterProfile().then((profile) => {
      if (cancelled) return;
      const [first, last] = splitName(profile?.name || user.displayName || '');
      setFirstName((prev) => prev || first);
      setLastName((prev) => prev || last);
      setLoadingExisting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-up isn’t configured yet — the app is missing its backend credentials.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      const credential = await signInWithGoogleIdToken(idToken);
      const [first, last] = splitName(credential.user.displayName ?? '');
      setFirstName((prev) => prev || first);
      setLastName((prev) => prev || last);
      setEmail(credential.user.email ?? '');
    } catch (err: any) {
      const message = friendlyGoogleError(err?.message ?? err?.code ?? '');
      if (message) setError(message);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleGoogleError = (err: Error) => {
    const message = friendlyGoogleError(err?.message ?? '');
    if (message) setError(message);
  };

  const handleContinue = async () => {
    setError(null);
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Add your first and last name to continue.');
      return;
    }
    if (!connected && !auth?.currentUser) {
      if (!email.trim() || !password) {
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
    }

    setSubmitting(true);
    try {
      // A retry after an earlier failed attempt (e.g. the account got
      // created but the save below failed) would otherwise throw
      // auth/email-already-in-use here — only create it if that didn't
      // already happen, same reasoning as onboarding/account.tsx.
      if (!auth?.currentUser) {
        const credential = await createUserWithEmailAndPassword(auth!, email.trim(), password);
        await updateProfile(credential.user, { displayName: name });
      } else if (auth.currentUser.displayName !== name) {
        await updateProfile(auth.currentUser, { displayName: name });
      }

      const isNew = !connected;
      await saveMySitterProfile(
        {
          name,
          email: auth?.currentUser?.email ?? email.trim(),
          ...(isNew && prefillZip ? { zipCode: prefillZip } : {}),
          signupStep: '/provider-signup/experience',
          signupComplete: false,
        },
        isNew,
        isNew ? referralCodeInput.trim() || undefined : undefined
      );
      router.push('/provider-signup/experience');
    } catch (err: any) {
      setError(err?.code ? friendlyError(err.code) : err instanceof Error ? err.message : 'Something went wrong saving your info. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loadingExisting) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WizardHeader step={1} totalSteps={3} title="Create your" accent="account." backTo="/" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Register to be listed for families on Opened Circle looking for a provider.</Text>

        <View style={styles.row}>
          <View style={styles.half}>
            <FieldInput label="First name" placeholder="Jamie" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={styles.half}>
            <FieldInput label="Last name" placeholder="Chen" value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        {connected ? (
          <View style={styles.connectedRow}>
            <Text style={styles.connectedTitle}>Signed in</Text>
            <Text style={styles.connectedEmail}>{user?.email}</Text>
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
            <FieldInput
              label="Referral code"
              placeholder="e.g. CHRISTINA5H2"
              optional
              value={referralCodeInput}
              onChangeText={setReferralCodeInput}
              autoCapitalize="characters"
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleContinue} disabled={submitting}>
          <Text style={styles.ctaText}>{submitting ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
        {!connected ? (
          <>
            <GoogleSignInButton onCredential={handleGoogleCredential} onError={handleGoogleError} />
            {googleSubmitting ? <Text style={styles.googleStatus}>Signing up…</Text> : null}
          </>
        ) : null}
      </View>
    </View>
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
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.positiveMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  connectedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  connectedEmail: {
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 8,
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
  googleStatus: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
  },
});
