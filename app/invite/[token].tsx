import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { EmptyState } from '../../components/EmptyState';
import { FieldInput } from '../../components/FieldInput';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { PhotoCropperModal } from '../../components/PhotoCropperModal';
import { useAuth } from '../../contexts/AuthContext';
import { auth, firebaseConfigured, signInWithGoogleIdToken } from '../../lib/firebase';
import { acceptFamilyInvite, FamilyInviteDetails, getFamilyInvite } from '../../lib/familyMembers';
import { pickAndUploadNativePhoto, pickImageFile, uploadPhotoBlob } from '../../lib/photoUpload';
import { colors } from '../../theme/colors';

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with that email already exists — try signing in instead, then reopen this invite link.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    default:
      return 'Something went wrong creating your account. Please try again.';
  }
}

export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user, loading: authLoading, refreshFamilyUid } = useAuth();

  const [invite, setInvite] = useState<FamilyInviteDetails | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getFamilyInvite(token)
      .then((result) => {
        if (!cancelled) setInvite(result);
      })
      .catch(() => {
        if (!cancelled) setInvite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (invite) setName((prev) => prev || invite.name);
  }, [invite]);

  // Photo upload needs an already-signed-in user (see lib/photoUpload.ts) —
  // so this whole step only ever renders once account creation (below) or
  // an existing sign-in has already put someone in `user`.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (Platform.OS === 'web') {
      const file = await pickImageFile();
      if (file) setPickedPhoto(file);
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadNativePhoto('profile-photo.jpg');
      if (url) setPhotoUrl(url);
    } catch {
      setPhotoError('Couldn’t upload that photo — check your photo library permission and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPickedPhoto(null);
    setUploadingPhoto(true);
    try {
      const url = await uploadPhotoBlob(blob, 'profile-photo.jpg');
      setPhotoUrl(url);
    } catch {
      setPhotoError('Couldn’t upload that photo — check your connection and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCreateAccount = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Add your name to continue.');
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
      await updateProfile(credential.user, { displayName: name.trim() });
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-up isn’t configured yet — the app is missing its backend credentials.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      await signInWithGoogleIdToken(idToken);
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong signing up with Gmail — please try again.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!token || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      await acceptFamilyInvite(token, photoUrl);
      // The familyMembers doc that just made this true didn't come from an
      // auth state change, so nothing would otherwise prompt AuthContext to
      // re-resolve it — every (tabs) screen needs the real familyUid, not
      // this uid's own, from the moment it mounts.
      await refreshFamilyUid();
      router.replace('/(tabs)');
    } catch (err: any) {
      setJoinError(err?.message ?? 'Couldn’t join the family — please try again.');
    } finally {
      setJoining(false);
    }
  };

  if (invite === undefined || authLoading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (invite === null) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <EmptyState text="This invite link is no longer valid — ask whoever invited you to send a new one." />
        <Pressable style={styles.cta} onPress={() => router.replace('/')}>
          <Text style={styles.ctaText}>Go to Haven.ly</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Signed in already (either just created above, or this is an existing
  // Haven.ly member who was invited into a second family) — show the photo
  // step and let them actually join.
  if (user) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.headline}>Almost there</Text>
          <Text style={styles.subtext}>
            Add a photo so {invite.familyLabel} recognizes you — or skip it for now.
          </Text>

          <AddPhotoCircle
            label="Your photo"
            caption="Optional"
            imageUri={photoUrl}
            uploading={uploadingPhoto}
            onPress={handlePickPhoto}
          />
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
          <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable style={[styles.cta, joining && styles.ctaDisabled]} onPress={handleJoin} disabled={joining}>
            {joining ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.ctaText}>Join {invite.familyLabel}</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="people" size={32} color={colors.accent} style={styles.headerIcon} />
        <Text style={styles.headline}>{invite.invitedByName} invited you</Text>
        <Text style={styles.subtext}>
          Join {invite.familyLabel} on Haven.ly as their {invite.relationship.toLowerCase()} — you'll see everything
          they see: matches, messages, and playdates.
        </Text>

        <FieldInput label="Your name" placeholder="Jamie" value={name} onChangeText={setName} />
        <FieldInput
          label="Email"
          placeholder="jamie@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FieldInput label="Password" placeholder="6+ characters" value={password} onChangeText={setPassword} secureTextEntry />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleCreateAccount} disabled={submitting}>
          <Text style={styles.ctaText}>{submitting ? 'Creating account…' : 'Continue'}</Text>
        </Pressable>
        <GoogleSignInButton onCredential={handleGoogleCredential} onError={(err) => setError(err.message)} />
        {googleSubmitting ? <Text style={styles.googleStatus}>Signing up…</Text> : null}
        <Pressable onPress={() => router.push('/sign-in')}>
          <Text style={styles.signInHint}>
            Already have a Haven.ly account? <Text style={styles.signInHintAccent}>Sign in</Text> first, then reopen
            this link.
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
    paddingHorizontal: 32,
    gap: 20,
  },
  content: {
    padding: 20,
  },
  headerIcon: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 8,
    textAlign: 'center',
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
    // The invalid-invite state renders this inside `centered`, whose
    // alignItems: 'center' makes a Pressable shrink-wrap its content
    // instead of filling the row — collapsing it into a circle around its
    // label (borderRadius: 999 on an unconstrained near-square). stretch
    // forces full width regardless of which container renders it.
    alignSelf: 'stretch',
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
  signInHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  signInHintAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
});
