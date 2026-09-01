import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { PhotoCropperModal } from '../../components/PhotoCropperModal';
import { ZipCodeField } from '../../components/ZipCodeField';
import { useAuth } from '../../contexts/AuthContext';
import { NEURODIVERGENCE_OPTIONS } from '../../lib/neurodivergence';
import { extensionFromDocumentAsset, pickDocument, pickImageFile, pickNativePhoto, PickedDocument, uploadPhotoBlob } from '../../lib/photoUpload';
import { useIsDesktop } from '../../lib/responsive';
import {
  docExtensionLabel,
  emptySitterProfile,
  fetchMySitterProfile,
  isImageDocUrl,
  saveMySitterProfile,
  SitterProfile,
  SITTER_CERTIFICATIONS,
} from '../../lib/sitters';
import { colors } from '../../theme/colors';

// NEURODIVERGENCE_OPTIONS' own order is deliberate for where else it's
// used (app/onboarding/child.tsx) — sorted only here, for this screen's
// "Experience with" list, rather than reordering the shared source array.
const SORTED_NEURODIVERGENCE_OPTIONS = [...NEURODIVERGENCE_OPTIONS].sort((a, b) => a.localeCompare(b));

const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607453998774-d533f65dac99?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

function friendlyError(err: any, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// A fresh (non-edit) visit used to render a single-page signup form right
// here. That's now app/sitter-signup/{account,experience,about}.tsx's job
// — a real 3-step wizard with Google sign-in and step-by-step progress
// saving, so a sitter who bails partway through can resume later instead
// of losing everything. This route now only handles editing an existing,
// already-complete profile (?edit=1, reached from Profile) — anyone
// landing here without that redirects straight into step 1, carrying
// along name/zip if the sitters splash page's interest form is where they
// came from (see app/sitters.tsx).
export default function SitterSignup() {
  const { edit, name: prefillName, zip: prefillZip } = useLocalSearchParams<{
    edit?: string;
    name?: string;
    zip?: string;
  }>();
  const editMode = edit === '1';
  const { user, loading: authLoading } = useAuth();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (editMode) return;
    router.replace({ pathname: '/sitter-signup/account', params: { name: prefillName, zip: prefillZip } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const [loadingExisting, setLoadingExisting] = useState(true);
  const [profile, setProfile] = useState<SitterProfile>(emptySitterProfile);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  // Picked locally but not yet uploaded — see the big comment on
  // handleSubmit below for why upload is deferred to submit time instead
  // of happening the moment something's picked.
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [pendingPhotoPreviewUri, setPendingPhotoPreviewUri] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pendingDocs, setPendingDocs] = useState<PickedDocument[]>([]);
  const [pickingDoc, setPickingDoc] = useState(false);
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

  const uploadErrorMessage = (err: any, fallback: string): string => friendlyError(err, fallback);

  // Picking (and, on web, cropping) a photo is purely local — no network —
  // so it happens immediately; the actual upload is deferred to
  // handleSubmit.
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

  const handleAddDocument = async () => {
    setDocError(null);
    setPickingDoc(true);
    try {
      const picked = await pickDocument();
      if (picked) setPendingDocs((prev) => [...prev, picked]);
    } catch (err) {
      setDocError(uploadErrorMessage(err, 'Couldn’t open the file picker — check your connection and try again.'));
    } finally {
      setPickingDoc(false);
    }
  };

  const removeUploadedDocument = (url: string) => {
    patch({ certificationDocUrls: profile.certificationDocUrls.filter((u) => u !== url) });
  };

  const removePendingDocument = (index: number) => {
    setPendingDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadPendingAssets = async (base: SitterProfile): Promise<SitterProfile> => {
    let next = base;
    if (pendingPhotoBlob) {
      const url = await uploadPhotoBlob(pendingPhotoBlob, 'sitter-photo.jpg');
      next = { ...next, photoUrl: url };
    }
    if (pendingDocs.length) {
      const uploadedUrls = await Promise.all(
        pendingDocs.map((doc, i) => {
          const ext = extensionFromDocumentAsset(doc.name, doc.mimeType);
          return uploadPhotoBlob(doc.blob, `sitter-cert-${Date.now()}-${i}.${ext}`, doc.mimeType);
        })
      );
      next = { ...next, certificationDocUrls: [...next.certificationDocUrls, ...uploadedUrls] };
    }
    return next;
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
    if (!pendingPhotoPreviewUri && !profile.photoUrl) {
      setError('Add a photo to continue.');
      return;
    }
    if (!profile.phone.trim()) {
      setError('Add your phone number to continue.');
      return;
    }
    if (!profile.bio.trim()) {
      setError('Tell families a bit about yourself to continue.');
      return;
    }
    if (!profile.yearsExperience.trim()) {
      setError('Add your years of experience to continue.');
      return;
    }
    if (!profile.hourlyRate.trim()) {
      setError('Add your hourly rate to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const finalProfile = await uploadPendingAssets(profile);
      await saveMySitterProfile(finalProfile, false);
      router.replace('/(sitter)');
    } catch (err: any) {
      setError(uploadErrorMessage(err, 'Something went wrong saving your profile. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!editMode) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

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
        <Pressable style={styles.back} onPress={() => router.replace('/(sitter)')}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit your profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.topSection, isDesktop && styles.topSectionDesktop]}>
          <View style={[styles.topFields, isDesktop && styles.topFieldsDesktop]}>
            <FieldInput label="Your name" placeholder="Jordan Lee" value={profile.name} onChangeText={(name) => patch({ name })} />
            <View style={styles.connectedRow}>
              <Ionicons name="mail-outline" size={22} color={colors.positive} />
              <View style={styles.connectedTextWrap}>
                <Text style={styles.connectedTitle}>Signed in</Text>
                <Text style={styles.connectedEmail}>{user?.email}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.topPhoto, isDesktop && styles.topPhotoDesktop]}>
            <AddPhotoCircle
              label="Your photo"
              caption="Tap to add"
              imageUri={pendingPhotoPreviewUri ?? profile.photoUrl}
              uploading={pickingPhoto}
              onPress={handlePickPhoto}
              align="flex-start"
            />
            {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
          </View>
        </View>
        <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

        <FieldInput
          label="Phone"
          placeholder="(555) 123-4567"
          value={profile.phone}
          onChangeText={(phone) => patch({ phone })}
          keyboardType="phone-pad"
        />
        <FieldInput
          label="About you"
          placeholder="Your experience, what you love about sitting…"
          multiline
          value={profile.bio}
          onChangeText={(bio) => patch({ bio })}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <FieldInput
              label="Years of experience"
              placeholder="3"
              value={profile.yearsExperience}
              onChangeText={(yearsExperience) => patch({ yearsExperience })}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <FieldInput
              label="Hourly rate"
              placeholder="$20/hr"
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
          {SORTED_NEURODIVERGENCE_OPTIONS.map((option) => (
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
        {profile.certificationDocUrls.length > 0 || pendingDocs.length > 0 ? (
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
                <Pressable style={styles.docRemoveButton} onPress={() => removeUploadedDocument(url)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
            {/* Not uploaded yet — see handleAddDocument's comment — so
                these render from the local pick (previewUri/mimeType)
                rather than a Storage URL. */}
            {pendingDocs.map((doc, i) => (
              <View key={`${doc.name}-${i}`} style={styles.docThumbWrap}>
                {doc.mimeType?.startsWith('image/') ? (
                  <Image source={{ uri: doc.previewUri }} style={styles.docThumb} />
                ) : (
                  <View style={[styles.docThumb, styles.docFileThumb]}>
                    <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.docFileLabel}>{extensionFromDocumentAsset(doc.name, doc.mimeType).toUpperCase()}</Text>
                  </View>
                )}
                <Pressable style={styles.docRemoveButton} onPress={() => removePendingDocument(i)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {docError ? <Text style={styles.photoError}>{docError}</Text> : null}
        <Pressable style={styles.addDocButton} onPress={handleAddDocument} disabled={pickingDoc}>
          {pickingDoc ? (
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
          <Text style={styles.ctaText}>{submitting ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
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
                  <Image source={require('../../assets/logo-mark.png')} style={styles.desktopBrandMark} resizeMode="contain" />
                  <Text style={styles.desktopWordmark}>
                    Opened <Text style={styles.desktopWordmarkAccent}>Circle</Text> for Sitters
                  </Text>
                </View>
              </View>
              <Text style={styles.desktopPanelTitle}>Keep your profile current.</Text>
              <Text style={styles.desktopPanelText}>
                Families see your profile exactly as you leave it here — availability, rate, and experience
                included.
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
  photoError: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
  },
  topSection: {
    flexDirection: 'column',
  },
  topSectionDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  topFields: {
    flexShrink: 0,
  },
  topFieldsDesktop: {
    flex: 1,
  },
  topPhoto: {},
  topPhotoDesktop: {
    width: 200,
    paddingTop: 32,
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
