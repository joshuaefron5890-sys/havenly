import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { FieldInput } from '../../components/FieldInput';
import { PhotoCropperModal } from '../../components/PhotoCropperModal';
import { WizardHeader } from '../../components/WizardHeader';
import { emptySiblingProfile, SiblingProfile, useOnboarding } from '../../contexts/OnboardingContext';
import { numSiblings, stepBeforeSiblings } from '../../lib/onboardingFlow';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { pickAndUploadNativePhoto, pickImageFile, uploadPhotoBlob } from '../../lib/photoUpload';
import { fetchNearbySchools, NearbySchool, schoolSubtitle } from '../../lib/schools';
import { colors } from '../../theme/colors';

export default function Siblings() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const total = Math.max(
    1,
    numSiblings({ numChildren: profile.numChildren, numNeurodivergentChildren: profile.numNeurodivergentChildren })
  );
  const [siblingIndex, setSiblingIndex] = useState(0);
  const [siblingsData, setSiblingsData] = useState<SiblingProfile[]>(() =>
    Array.from({ length: total }, (_, i) => ({ ...emptySiblingProfile, ...profile.siblingProfiles[i] }))
  );
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same "nearby, then narrowed by typing" picker as the neurodivergent
  // child step (app/onboarding/child.tsx) — fetched once for the family's
  // own zip, not per keystroke.
  const [nearbySchools, setNearbySchools] = useState<NearbySchool[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchNearbySchools()
      .then((schools) => {
        if (!cancelled) setNearbySchools(schools);
      })
      .catch((err: any) => {
        console.error('fetchNearbySchools failed:', err?.code ?? err?.message ?? err);
        if (!cancelled) setNearbySchools([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = siblingsData[siblingIndex];

  const schoolSuggestions = useMemo(() => {
    if (!nearbySchools?.length) return [];
    const q = current.school.trim().toLowerCase();
    const matches = q ? nearbySchools.filter((s) => s.name.toLowerCase().includes(q)) : nearbySchools;
    return matches.slice(0, 5);
  }, [nearbySchools, current.school]);

  const updateCurrent = (patch: Partial<SiblingProfile>) => {
    setSiblingsData((prev) => prev.map((s, i) => (i === siblingIndex ? { ...s, ...patch } : s)));
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
      const url = await pickAndUploadNativePhoto(`sibling-photo-${siblingIndex}.jpg`);
      if (url) updateCurrent({ photoUrl: url });
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
      const url = await uploadPhotoBlob(blob, `sibling-photo-${siblingIndex}.jpg`);
      updateCurrent({ photoUrl: url });
    } catch {
      setPhotoError('Couldn’t upload that photo — check your connection and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = () => {
    setError(null);
    if (!current.name.trim()) {
      setError('Add a name to continue.');
      return;
    }
    if (siblingIndex + 1 < total) {
      setSiblingIndex(siblingIndex + 1);
      return;
    }
    const patch = { siblingProfiles: siblingsData };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/play-style', { editMode });
    router.push(editMode ? '/profile' : '/onboarding/play-style');
  };

  const handleBack = () => {
    if (siblingIndex > 0) {
      setError(null);
      setSiblingIndex(siblingIndex - 1);
    } else if (editMode) {
      router.replace('/profile');
    } else {
      router.replace(
        stepBeforeSiblings({
          numChildren: profile.numChildren,
          numNeurodivergentChildren: profile.numNeurodivergentChildren,
        }) as any
      );
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={4}
        title="About"
        accent={total > 1 ? `sibling ${siblingIndex + 1} of ${total}.` : 'their sibling.'}
        onBack={handleBack}
        editMode={editMode}
      />
      <Text style={styles.caption}>Just the basics — this helps us find playdates that work for the whole family.</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <AddPhotoCircle
          label={total > 1 ? `Sibling ${siblingIndex + 1}'s photo` : "Sibling's photo"}
          caption="Tap to add · optional"
          imageUri={current.photoUrl}
          uploading={uploadingPhoto}
          onPress={handlePickPhoto}
        />
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
        <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

        <View style={styles.row}>
          <View style={styles.grow}>
            <FieldInput label="Sibling's name" placeholder="Sam" value={current.name} onChangeText={(name) => updateCurrent({ name })} />
          </View>
          <View style={styles.small}>
            <FieldInput
              label="Age"
              placeholder="9"
              optional
              value={current.age}
              onChangeText={(age) => updateCurrent({ age })}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <FieldInput label="Gender" placeholder="e.g. Girl" optional value={current.gender} onChangeText={(gender) => updateCurrent({ gender })} />
        <FieldInput label="Grade" placeholder="e.g. 4th grade" optional value={current.grade} onChangeText={(grade) => updateCurrent({ grade })} />
        <FieldInput label="School" placeholder="e.g. Lincoln Elementary" optional value={current.school} onChangeText={(school) => updateCurrent({ school })} />
        {schoolSuggestions.length > 0 ? (
          <View style={styles.schoolSuggestions}>
            {schoolSuggestions.map((school) => (
              <Pressable
                key={school.id}
                style={styles.schoolSuggestionRow}
                onPress={() => updateCurrent({ school: school.name })}
              >
                <Text style={styles.schoolSuggestionName}>{school.name}</Text>
                <Text style={styles.schoolSuggestionMeta}>{schoolSubtitle(school)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={handleContinue}>
          <Text style={styles.ctaText}>
            {siblingIndex + 1 < total ? 'Next sibling' : editMode ? 'Save changes' : 'Continue'}
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
  caption: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  content: {
    padding: 20,
    paddingTop: 0,
  },
  photoError: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
  },
  schoolSuggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    marginTop: -10,
    marginBottom: 16,
    overflow: 'hidden',
  },
  schoolSuggestionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  schoolSuggestionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  schoolSuggestionMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  grow: {
    flex: 2,
  },
  small: {
    flex: 1,
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
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
