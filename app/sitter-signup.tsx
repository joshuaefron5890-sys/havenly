import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../components/AddPhotoCircle';
import { Chip } from '../components/Chip';
import { FieldInput } from '../components/FieldInput';
import { PhotoCropperModal } from '../components/PhotoCropperModal';
import { ZipCodeField } from '../components/ZipCodeField';
import { useAuth } from '../contexts/AuthContext';
import { auth, firebaseConfigured } from '../lib/firebase';
import { NEURODIVERGENCE_OPTIONS } from '../lib/neurodivergence';
import { pickAndUploadDocument, pickAndUploadNativePhoto, pickImageFile, uploadPhotoBlob } from '../lib/photoUpload';
import { useIsDesktop } from '../lib/responsive';
import {
  docExtensionLabel,
  emptySitterProfile,
  fetchMySitterProfile,
  isImageDocUrl,
  saveMySitterProfile,
  SitterProfile,
  SITTER_CERTIFICATIONS,
} from '../lib/sitters';
import { colors } from '../theme/colors';

// Same photo already vetted for app/sitters.tsx's hero and the in-app
// sitter promo card (app/proposal/[id].tsx's SITTER_PROMO_IMAGE) — reused
// here for the same "Become a sitter" visual identity rather than picking
// a new, unvetted image.
const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1585541993027-55373d67ea86?q=80&w=1658&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

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

export default function SitterSignup() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { user, loading: authLoading } = useAuth();
  const isDesktop = useIsDesktop();

  const [loadingExisting, setLoadingExisting] = useState(editMode);
  const [profile, setProfile] = useState<SitterProfile>(emptySitterProfile);
  const [password, setPassword] = useState('');
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editMode) return;
    let cancelled = false;
    fetchMySitterProfile().then((result) => {
      if (!cancelled && result) setProfile(result);
      if (!cancelled) setLoadingExisting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [editMode]);

  const patch = (fields: Partial<SitterProfile>) => setProfile((prev) => ({ ...prev, ...fields }));

  const toggleFromList = (key: 'specialties' | 'certifications', option: string) => {
    setProfile((prev) => ({
      ...prev,
      [key]: prev[key].includes(option) ? prev[key].filter((o) => o !== option) : [...prev[key], option],
    }));
  };

  // Photo/document upload both need auth.currentUser to be set (see
  // uploadPhotoBlob), but on a brand-new (non-edit) signup the account
  // isn't created until handleSubmit's final "Submit for review" — and the
  // photo field sits at the very top of this single-page form, well before
  // that. Rather than restructure the whole form around deferred uploads,
  // this lazily creates the account the first time someone tries to upload
  // anything, using whatever email/password they've already filled in
  // above it on the page. handleSubmit below then skips re-creating the
  // account if this already did.
  const ensureSignedIn = async (): Promise<void> => {
    if (editMode || auth?.currentUser) return;
    if (!firebaseConfigured || !auth) {
      throw new Error('Sign-up isn’t configured yet — the app is missing its backend credentials.');
    }
    if (!profile.email.trim() || !password) {
      throw new Error('Add your email and password above first, then try uploading again.');
    }
    if (password.length < 6) {
      throw new Error('Password should be at least 6 characters.');
    }
    await createUserWithEmailAndPassword(auth, profile.email.trim(), password);
  };

  // Firebase auth errors carry a `.code` (mapped via friendlyError); the
  // plain Errors ensureSignedIn throws above carry a human-readable
  // `.message` directly — anything else falls back to the generic message.
  const uploadErrorMessage = (err: any, fallback: string): string => {
    if (err?.code) return friendlyError(err.code);
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (Platform.OS === 'web') {
      const file = await pickImageFile();
      if (file) setPickedPhoto(file);
      return;
    }
    setUploadingPhoto(true);
    try {
      await ensureSignedIn();
      const url = await pickAndUploadNativePhoto('sitter-photo.jpg');
      if (url) patch({ photoUrl: url });
    } catch (err) {
      setPhotoError(uploadErrorMessage(err, 'Couldn’t upload that photo — check your photo library permission and try again.'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPickedPhoto(null);
    setUploadingPhoto(true);
    try {
      await ensureSignedIn();
      const url = await uploadPhotoBlob(blob, 'sitter-photo.jpg');
      patch({ photoUrl: url });
    } catch (err) {
      setPhotoError(uploadErrorMessage(err, 'Couldn’t upload that photo — check your connection and try again.'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  // A certification document is often a PDF or Word doc, not a photo —
  // pickAndUploadDocument opens the OS's own file picker (Files/iCloud
  // Drive/Google Drive on native, the browser's file picker on web) rather
  // than restricting to the photo library the way the profile photo above
  // does, and handles both platforms itself (no Platform.OS branching
  // needed here, unlike the photo flow).
  const handleAddDocument = async () => {
    setDocError(null);
    setUploadingDoc(true);
    try {
      await ensureSignedIn();
      const url = await pickAndUploadDocument('sitter-cert');
      if (url) patch({ certificationDocUrls: [...profile.certificationDocUrls, url] });
    } catch (err) {
      setDocError(uploadErrorMessage(err, 'Couldn’t upload that document — check your connection and try again.'));
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeDocument = (url: string) => {
    patch({ certificationDocUrls: profile.certificationDocUrls.filter((u) => u !== url) });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!profile.name.trim()) {
      setError('Add your name to continue.');
      return;
    }
    if (!profile.zipCode || !profile.city) {
      setError('Add your zip code to continue — it’s how families near you can find you.');
      return;
    }

    if (editMode) {
      setSubmitting(true);
      try {
        await saveMySitterProfile(profile, false);
        router.replace('/(sitter)');
      } catch (err: any) {
        setError(err?.message ?? err?.code ?? 'Something went wrong saving your profile. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!profile.email || !password) {
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
      // ensureSignedIn (called from an earlier photo/document upload) may
      // have already created the account — re-calling
      // createUserWithEmailAndPassword here would throw
      // auth/email-already-in-use, so only create it if that didn't
      // already happen.
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: profile.name.trim() });
      } else {
        const credential = await createUserWithEmailAndPassword(auth, profile.email.trim(), password);
        await updateProfile(credential.user, { displayName: profile.name.trim() });
      }
      await saveMySitterProfile(profile, true);
      router.replace('/(sitter)');
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loadingExisting) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const formShell = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.replace(editMode ? '/(sitter)' : '/')}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editMode ? 'Edit your profile' : 'Become a sitter'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!editMode ? (
          <Text style={styles.intro}>
            Register to be listed for families on Haven.ly looking for a sitter. We’ll review your background
            check before you show up in any recommendations.
          </Text>
        ) : null}

        <FieldInput label="Your name" placeholder="Jordan Lee" value={profile.name} onChangeText={(name) => patch({ name })} />

        {editMode ? (
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
              placeholder="jordan@email.com"
              value={profile.email}
              onChangeText={(email) => patch({ email })}
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

        {/* Photo comes after email/password (not first, despite being the
            first thing visually in earlier versions of this form) — adding
            it lazily creates the account via ensureSignedIn using whatever
            email/password have been entered so far, which only works once
            those fields are actually filled in. */}
        <AddPhotoCircle
          label="Your photo"
          caption="Tap to add · optional"
          imageUri={profile.photoUrl}
          uploading={uploadingPhoto}
          onPress={handlePickPhoto}
        />
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
        <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

        <FieldInput
          label="Phone"
          placeholder="(555) 123-4567"
          optional
          value={profile.phone}
          onChangeText={(phone) => patch({ phone })}
          keyboardType="phone-pad"
        />
        <FieldInput
          label="About you"
          placeholder="Your experience, what you love about sitting…"
          optional
          multiline
          value={profile.bio}
          onChangeText={(bio) => patch({ bio })}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <FieldInput
              label="Years of experience"
              placeholder="3"
              optional
              value={profile.yearsExperience}
              onChangeText={(yearsExperience) => patch({ yearsExperience })}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <FieldInput
              label="Hourly rate"
              placeholder="$20/hr"
              optional
              value={profile.hourlyRate}
              onChangeText={(hourlyRate) => patch({ hourlyRate })}
            />
          </View>
        </View>

        <ZipCodeField
          zip={profile.zipCode}
          city={profile.city}
          state={profile.state}
          onChange={(next) => patch({ zipCode: next.zip, city: next.city, state: next.state })}
        />

        <Text style={styles.label}>EXPERIENCE WITH · SELECT ANY</Text>
        <View style={styles.chips}>
          {NEURODIVERGENCE_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={profile.specialties.includes(option)}
              onPress={() => toggleFromList('specialties', option)}
            />
          ))}
        </View>

        <Text style={styles.label}>CREDENTIALS · SELECT ANY</Text>
        <View style={styles.chips}>
          {SITTER_CERTIFICATIONS.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={profile.certifications.includes(option)}
              onPress={() => toggleFromList('certifications', option)}
            />
          ))}
        </View>

        <Text style={styles.label}>CERTIFICATION DOCUMENTS · OPTIONAL</Text>
        <Text style={styles.docHelper}>
          PDFs, photos, or Word docs of certification cards or credentials, reviewed privately during vetting —
          never shown to families.
        </Text>
        {profile.certificationDocUrls.length > 0 ? (
          <View style={styles.docGrid}>
            {profile.certificationDocUrls.map((url) => (
              <View key={url} style={styles.docThumbWrap}>
                {isImageDocUrl(url) ? (
                  <Image source={{ uri: url }} style={styles.docThumb} />
                ) : (
                  <View style={[styles.docThumb, styles.docFileThumb]}>
                    <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.docFileLabel}>{docExtensionLabel(url)}</Text>
                  </View>
                )}
                <Pressable style={styles.docRemoveButton} onPress={() => removeDocument(url)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {docError ? <Text style={styles.photoError}>{docError}</Text> : null}
        <Pressable style={styles.addDocButton} onPress={handleAddDocument} disabled={uploadingDoc}>
          {uploadingDoc ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
              <Text style={styles.addDocText}>Add document</Text>
            </>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.ctaText}>
            {submitting ? 'Saving…' : editMode ? 'Save changes' : 'Submit for review'}
          </Text>
        </Pressable>
      </View>
    </>
  );

  if (isDesktop) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.desktopRow}>
          <ImageBackground source={{ uri: PANEL_IMAGE }} style={styles.desktopPanel} resizeMode="cover">
            <LinearGradient
              colors={['rgba(20, 18, 16, 0.35)', 'rgba(20, 18, 16, 0.55)', 'rgba(20, 18, 16, 0.88)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.desktopPanelContent}>
              <View style={styles.desktopBrandChip}>
                <View style={styles.desktopBrandRow}>
                  <Image source={require('../assets/logo-mark.png')} style={styles.desktopBrandMark} resizeMode="contain" />
                  <Text style={styles.desktopWordmark}>
                    Haven<Text style={styles.desktopWordmarkAccent}>.ly</Text> for Sitters
                  </Text>
                </View>
              </View>
              <Text style={styles.desktopPanelTitle}>
                {editMode ? 'Keep your profile current.' : 'Get matched with families who actually need you.'}
              </Text>
              <Text style={styles.desktopPanelText}>
                {editMode
                  ? 'Families see your profile exactly as you leave it here — availability, rate, and experience included.'
                  : "We'll review your background check before you show up in any family's recommendations."}
              </Text>
            </View>
          </ImageBackground>
          <View style={styles.desktopFormWrap}>
            <View style={styles.desktopFormInner}>{formShell}</View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>{formShell}</SafeAreaView>;
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
    paddingTop: 4,
  },
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
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
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  docHelper: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -4,
    marginBottom: 10,
  },
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  docThumbWrap: {
    width: 72,
    height: 72,
  },
  docThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  docFileThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  docFileLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  docRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  addDocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    marginBottom: 20,
  },
  addDocText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 8,
  },
  footer: {
    padding: 20,
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
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopPanel: {
    width: '38%',
    backgroundColor: colors.accentMuted,
  },
  desktopPanelContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 48,
  },
  // A backing chip rather than relying on the gradient alone — same
  // reasoning as the fix on app/index.tsx / app/sitters.tsx.
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
    fontSize: 15,
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
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  desktopPanelText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  desktopFormWrap: {
    flex: 1,
    alignItems: 'center',
  },
  desktopFormInner: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
  },
});
