import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../components/FieldInput';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useOnboarding } from '../contexts/OnboardingContext';
import { auth, firebaseConfigured, signInWithGoogleIdToken } from '../lib/firebase';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'No account found with that email and password.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/too-many-requests':
      return 'Too many attempts — try again in a bit.';
    default:
      return 'Something went wrong signing in. Please try again.';
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
      return `Something went wrong signing in with Gmail (${reason || 'unknown error'}) — please try again.`;
  }
}

export default function SignIn() {
  const isDesktop = useIsDesktop();
  const { updateProfile } = useOnboarding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (!firebaseConfigured || !auth) {
      setError('Sign-in isn’t configured yet.');
      return;
    }
    setSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeSignedInUser(credential.user, updateProfile);
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-in isn’t configured yet.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      const credential = await signInWithGoogleIdToken(idToken);
      await routeSignedInUser(credential.user, updateProfile);
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

  const authCard = (
    <>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.titleAccent}>back.</Text>
      <Text style={styles.subtext}>Sign in to pick up where you left off.</Text>

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
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleSignIn} disabled={submitting}>
        <Text style={styles.ctaText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>

      <GoogleSignInButton onCredential={handleGoogleCredential} onError={handleGoogleError} />
      {googleSubmitting ? <Text style={styles.googleStatus}>Signing in…</Text> : null}

      <Pressable onPress={() => router.replace('/onboarding/account')}>
        <Text style={styles.switch}>
          New here? <Text style={styles.switchAccent}>Create an account</Text>
        </Text>
      </Pressable>
    </>
  );

  if (isDesktop) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.desktopRow}>
          <View style={styles.desktopPanel}>
            <View style={styles.desktopBrandRow}>
              <Image source={require('../assets/logo-mark.png')} style={styles.desktopBrandMark} resizeMode="contain" />
              <Text style={styles.desktopWordmark}>
                Haven<Text style={styles.desktopWordmarkAccent}>.ly</Text>
              </Text>
            </View>
            <Text style={styles.desktopPanelTitle}>Pick up right where you left off.</Text>
            <Text style={styles.desktopPanelText}>
              Your matches, messages, and playdates are all waiting for you.
            </Text>
          </View>
          <View style={styles.desktopCardWrap}>
            <Pressable style={styles.desktopBack} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.desktopCard}>{authCard}</View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.content}>{authCard}</View>
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
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  titleAccent: {
    fontSize: 28,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.accent,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 24,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 12,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
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
    marginTop: -8,
    marginBottom: 16,
  },
  switch: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
  switchAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopPanel: {
    width: '42%',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 48,
    backgroundColor: colors.accentMuted,
  },
  desktopBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  desktopBrandMark: {
    width: 22,
    height: 22,
  },
  desktopWordmark: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  desktopWordmarkAccent: {
    color: colors.accent,
    fontStyle: 'italic',
  },
  desktopPanelTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 32,
  },
  desktopPanelText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  desktopCardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  desktopBack: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopCard: {
    width: '100%',
    maxWidth: 380,
  },
});
