import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { extensionFromDocumentAsset, pickDocument, PickedDocument, uploadPhotoBlob } from '../../lib/photoUpload';
import { NEURODIVERGENCE_OPTIONS } from '../../lib/neurodivergence';
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

// Same sorted copy as the old single-page flow — NEURODIVERGENCE_OPTIONS'
// own order is deliberate for where else it's used (app/onboarding/child.tsx).
const SORTED_NEURODIVERGENCE_OPTIONS = [...NEURODIVERGENCE_OPTIONS].sort((a, b) => a.localeCompare(b));

function friendlyError(err: any, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// Step 2 of 3 — phone, years of experience, the "experience with" tags,
// credentials, and certification document uploads. _layout.tsx already
// guarantees a signed-in account by the time this renders.
export default function SitterSignupExperience() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile>(emptySitterProfile);
  const [pendingDocs, setPendingDocs] = useState<PickedDocument[]>([]);
  const [pickingDoc, setPickingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMySitterProfile().then((result) => {
      if (cancelled) return;
      if (result) setProfile(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (fields: Partial<SitterProfile>) => setProfile((prev) => ({ ...prev, ...fields }));

  const toggleFromList = (key: 'specialties' | 'certifications', option: string) => {
    setProfile((prev) => ({
      ...prev,
      [key]: prev[key].includes(option) ? prev[key].filter((o) => o !== option) : [...prev[key], option],
    }));
  };

  const handleAddDocument = async () => {
    setDocError(null);
    setPickingDoc(true);
    try {
      const picked = await pickDocument();
      if (picked) setPendingDocs((prev) => [...prev, picked]);
    } catch (err) {
      setDocError(friendlyError(err, 'Couldn’t open the file picker — check your connection and try again.'));
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

  const handleContinue = async () => {
    setError(null);
    if (!profile.phone.trim()) {
      setError('Add your phone number to continue.');
      return;
    }
    if (!profile.yearsExperience.trim()) {
      setError('Add your years of experience to continue.');
      return;
    }

    setSubmitting(true);
    try {
      let certificationDocUrls = profile.certificationDocUrls;
      if (pendingDocs.length) {
        const uploadedUrls = await Promise.all(
          pendingDocs.map((doc, i) => {
            const ext = extensionFromDocumentAsset(doc.name, doc.mimeType);
            return uploadPhotoBlob(doc.blob, `sitter-cert-${Date.now()}-${i}.${ext}`, doc.mimeType);
          })
        );
        certificationDocUrls = [...certificationDocUrls, ...uploadedUrls];
      }

      await saveMySitterProfile(
        {
          phone: profile.phone.trim(),
          yearsExperience: profile.yearsExperience.trim(),
          specialties: profile.specialties,
          certifications: profile.certifications,
          certificationDocUrls,
          signupStep: '/sitter-signup/about',
          signupComplete: false,
        },
        false
      );
      router.push('/sitter-signup/about');
    } catch (err: any) {
      setError(friendlyError(err, 'Something went wrong saving your info. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WizardHeader step={2} totalSteps={3} title="Your" accent="experience." backTo="/sitter-signup/account" />
      <ScrollView contentContainerStyle={styles.content}>
        <FieldInput
          label="Phone"
          placeholder="(555) 123-4567"
          value={profile.phone}
          onChangeText={(phone) => patch({ phone })}
          keyboardType="phone-pad"
        />
        <FieldInput
          label="Years of experience"
          placeholder="3"
          value={profile.yearsExperience}
          onChangeText={(yearsExperience) => patch({ yearsExperience })}
          keyboardType="number-pad"
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
        {docError ? <Text style={styles.error}>{docError}</Text> : null}
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
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleContinue} disabled={submitting}>
          <Text style={styles.ctaText}>{submitting ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
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
    marginBottom: 8,
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
});
