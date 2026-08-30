import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { goBack } from '../lib/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../components/FieldInput';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useOnboarding } from '../contexts/OnboardingContext';
import { auth, firebaseConfigured, signInWithGoogleIdToken } from '../lib/firebase';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

// Same photo used on the sitter-signup left panel — one consistent hero
// image across the auth-adjacent screens rather than a different pick per
// screen.
const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607453998774-d533f65dac99?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

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
          <ImageBackground
            source={{ uri: PANEL_IMAGE }}
            style={styles.desktopPanel}
            imageStyle={styles.desktopPanelImage}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(20, 18, 16, 0.55)', 'rgba(20, 18, 16, 0.78)', 'rgba(20, 18, 16, 0.95)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.desktopPanelContent}>
              <View style={styles.desktopBrandChip}>
                <View style={styles.desktopBrandRow}>
                  <Image source={require('../assets/logo-mark.png')} style={styles.desktopBrandMark} resizeMode="contain" />
                  <Text style={styles.desktopWordmark}>
                    Haven<Text style={styles.desktopWordmarkAccent}>.ly</Text>
                  </Text>
                </View>
              </View>
              <Text style={styles.desktopPanelTitle}>Pick up right where you left off.</Text>
              <Text style={styles.desktopPanelText}>
                Your matches, messages, and playdates are all waiting for you.
              </Text>
            </View>
          </ImageBackground>
          <View style={styles.desktopCardWrap}>
            <Pressable style={styles.desktopBack} onPress={() => goBack()}>
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
        <Pressable style={styles.back} onPress={() => goBack()}>
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
    backgroundColor: colors.accentMuted,
  },
  // Explicit, rather than trusting resizeMode="cover" alone to size the
  // underlying <img> — forces it to actually fill the panel edge to edge.
  desktopPanelImage: {
    width: '100%',
    height: '100%',
  },
  desktopPanelContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 48,
  },
  // A backing chip rather than relying on the gradient alone — the photo's
  // brightness varies by crop, so the logo/wordmark need a guaranteed dark
  // patch behind them no matter what's there.
  desktopBrandChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20, 18, 16, 0.45)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
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
    color: '#FFFFFF',
  },
  desktopWordmarkAccent: {
    color: colors.accent,
    fontStyle: 'italic',
  },
  desktopPanelTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  desktopPanelText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
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
