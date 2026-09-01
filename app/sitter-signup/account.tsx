import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { FieldInput } from '../../components/FieldInput';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { PhotoCropperModal } from '../../components/PhotoCropperModal';
import { WizardHeader } from '../../components/WizardHeader';
import { useAuth } from '../../contexts/AuthContext';
import { auth, firebaseConfigured, signInWithGoogleIdToken } from '../../lib/firebase';
import { pickImageFile, pickNativePhoto, uploadPhotoBlob } from '../../lib/photoUpload';
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

// Step 1 of 3 — the only step reachable without an existing account,
// since it's the one that creates it (see _layout.tsx). A visitor who
// already has one (resumed via back-navigation, or a returning sitter
// whose earlier session got this far) sees a "connected" state instead of
// the signup form — same reasoning as app/onboarding/account.tsx's
// connectedGmail/editMode branch.
export default function SitterSignupAccount() {
  // Carried over from the sitters splash page's interest-list form, if
  // that's where this visit came from (via /sitter-signup's redirect —
  // see that file). name still lands in this step's own field below; zip
  // has nowhere to show yet (that's step 3), so it rides along silently
  // in the saved profile and step 3 picks it up from there.
  const { name: prefillName, zip: prefillZip } = useLocalSearchParams<{ name?: string; zip?: string }>();
  const { user, loading: authLoading } = useAuth();
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [name, setName] = useState(prefillName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [pendingPhotoPreviewUri, setPendingPhotoPreviewUri] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
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
      setName(profile?.name || user.displayName || '');
      setPhotoUrl(profile?.photoUrl ?? null);
      setLoadingExisting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const uploadErrorMessage = (err: any, fallback: string): string => {
    if (err?.code) return friendlyError(err.code);
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  // Same deferred-upload reasoning as the old single-page flow: picking
  // (and, on web, cropping) is purely local, no account needed yet.
  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (Platform.OS === 'web') {
      const file = await pickImageFile();
      if (file) setPickedPhoto(file);
      return;
    }
    setPickingPhoto(true);
    try {
      const picked = await pickNativePhoto();
      if (picked) {
        setPendingPhotoBlob(picked.blob);
        setPendingPhotoPreviewUri(picked.uri);
      }
    } catch (err) {
      setPhotoError(uploadErrorMessage(err, 'Couldn’t open your photo library — check its permission and try again.'));
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleCropConfirm = (blob: Blob) => {
    setPickedPhoto(null);
    setPendingPhotoBlob(blob);
    setPendingPhotoPreviewUri(URL.createObjectURL(blob));
  };

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    if (!firebaseConfigured || !auth) {
      setError('Sign-up isn’t configured yet — the app is missing its backend credentials.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      const credential = await signInWithGoogleIdToken(idToken);
      setName((prev) => prev || credential.user.displayName || '');
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
    if (!name.trim()) {
      setError('Add your name to continue.');
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
      // created but the photo upload or save below failed) would
      // otherwise throw auth/email-already-in-use here — only create it
      // if that didn't already happen, same reasoning as the old
      // single-page flow.
      if (!auth?.currentUser) {
        const credential = await createUserWithEmailAndPassword(auth!, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
      } else if (auth.currentUser.displayName !== name.trim()) {
        await updateProfile(auth.currentUser, { displayName: name.trim() });
      }

      let finalPhotoUrl = photoUrl;
      if (pendingPhotoBlob) {
        finalPhotoUrl = await uploadPhotoBlob(pendingPhotoBlob, 'sitter-photo.jpg');
      }

      const isNew = !connected;
      await saveMySitterProfile(
        {
          name: name.trim(),
          email: auth?.currentUser?.email ?? email.trim(),
          photoUrl: finalPhotoUrl,
          ...(isNew && prefillZip ? { zipCode: prefillZip } : {}),
          signupStep: '/sitter-signup/experience',
          signupComplete: false,
        },
        isNew,
        isNew ? referralCodeInput.trim() || undefined : undefined
      );
      router.push('/sitter-signup/experience');
    } catch (err: any) {
      setError(uploadErrorMessage(err, 'Something went wrong saving your info. Please try again.'));
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
      <WizardHeader step={1} totalSteps={3} title="Become a" accent="provider." backTo="/" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Register to be listed for families on Opened Circle looking for a sitter. We’ll review your background
          check before you show up in any recommendations.
        </Text>

        <View style={styles.topSection}>
          <FieldInput label="Your name" placeholder="Jordan Lee" value={name} onChangeText={setName} />

          {connected ? (
            <View style={styles.connectedRow}>
              <Ionicons name="mail-outline" size={22} color={colors.positive} />
              <View style={styles.connectedTextWrap}>
                <Text style={styles.connectedTitle}>Signed in</Text>
                <Text style={styles.connectedEmail}>{user?.email}</Text>
              </View>
            </View>
          ) : (
            <FieldInput
              label="Email"
              placeholder="jordan@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}

          <AddPhotoCircle
            label="Your photo"
            caption="Tap to add"
            imageUri={pendingPhotoPreviewUri ?? photoUrl}
            uploading={pickingPhoto}
            onPress={handlePickPhoto}
            align="flex-start"
          />
          {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
        </View>
        <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

        {!connected ? (
          <>
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
        ) : null}

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
  topSection: {
    gap: 0,
  },
  photoError: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
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
