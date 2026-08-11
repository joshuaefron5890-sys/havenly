import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../components/FieldInput';
import { auth, firebaseConfigured, googleSignInSupported, signInWithGoogleAccessToken } from '../lib/firebase';
import { requestGoogleAccessToken } from '../lib/googleIdentity';
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
      return 'Something went wrong signing in with Gmail. Please try again.';
  }
}

export default function SignIn() {
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
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-in isn’t configured yet.');
      return;
    }
    if (!googleSignInSupported()) {
      setError('Sign in with Gmail isn’t available on this platform yet — use email for now.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      const accessToken = await requestGoogleAccessToken();
      await signInWithGoogleAccessToken(accessToken);
      router.replace('/(tabs)');
    } catch (err: any) {
      const message = friendlyGoogleError(err?.code ?? err?.message ?? '');
      if (message) setError(message);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
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

        <Pressable
          style={[styles.googleButton, googleSubmitting && styles.ctaDisabled]}
          onPress={handleGoogleSignIn}
          disabled={googleSubmitting}
        >
          <Ionicons name="logo-google" size={18} color={colors.text} style={styles.googleIcon} />
          <Text style={styles.googleText}>{googleSubmitting ? 'Signing in…' : 'Sign in with Gmail'}</Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/onboarding/account')}>
          <Text style={styles.switch}>
            New here? <Text style={styles.switchAccent}>Create an account</Text>
          </Text>
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
  googleButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  googleIcon: {
    marginRight: 8,
  },
  googleText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
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
});
