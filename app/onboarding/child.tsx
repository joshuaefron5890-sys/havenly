import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { PhotoCropperModal } from '../../components/PhotoCropperModal';
import { WizardHeader } from '../../components/WizardHeader';
import { ChildProfile, emptyChildProfile, useOnboarding } from '../../contexts/OnboardingContext';
import { stepAfterChild } from '../../lib/onboardingFlow';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { photoUploadSupported, pickImageFile, uploadPhotoBlob } from '../../lib/photoUpload';
import { colors } from '../../theme/colors';

const NEURODIVERGENCE_OPTIONS = [
  'Autism',
  'ADHD',
  'Dyslexia',
  'Dyspraxia',
  'Sensory processing differences',
  'Communication differences',
  'Anxiety',
  'Intellectual/developmental disability',
  'Still figuring it out',
  'Prefer not to say',
];

export default function Child() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const total = Math.max(1, profile.numNeurodivergentChildren);
  const [childIndex, setChildIndex] = useState(0);
  const [childrenData, setChildrenData] = useState<ChildProfile[]>(() =>
    Array.from({ length: total }, (_, i) => ({ ...emptyChildProfile, ...profile.children[i] }))
  );
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = childrenData[childIndex];

  const updateCurrent = (patch: Partial<ChildProfile>) => {
    setChildrenData((prev) => prev.map((c, i) => (i === childIndex ? { ...c, ...patch } : c)));
  };

  const toggleNeurodivergence = (option: string) => {
    const next = current.neurodivergence.includes(option)
      ? current.neurodivergence.filter((o) => o !== option)
      : [...current.neurodivergence, option];
    updateCurrent({ neurodivergence: next });
  };

  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (!photoUploadSupported()) {
      setPhotoError('Photo upload isn’t available on this platform yet.');
      return;
    }
    const file = await pickImageFile();
    if (file) setPickedPhoto(file);
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPickedPhoto(null);
    setUploadingPhoto(true);
    try {
      const url = await uploadPhotoBlob(blob, `child-photo-${childIndex}.jpg`);
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
    if (childIndex + 1 < total) {
      setChildIndex(childIndex + 1);
      return;
    }
    const patch = { children: childrenData };
    updateProfile(patch);
    const nextStep = stepAfterChild({
      numChildren: profile.numChildren,
      numNeurodivergentChildren: profile.numNeurodivergentChildren,
    });
    saveOnboardingStep(patch, nextStep);
    router.push(editMode ? '/profile' : nextStep);
  };

  const handleBack = () => {
    if (childIndex > 0) {
      setError(null);
      setChildIndex(childIndex - 1);
    } else {
      router.replace(editMode ? '/profile' : '/onboarding/family');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={3}
        title="About your"
        accent={total > 1 ? `neurodivergent child ${childIndex + 1} of ${total}.` : 'neurodivergent child.'}
        onBack={handleBack}
        editMode={editMode}
      />
      <Text style={styles.caption}>
        This helps us match you with families who understand your child's needs — we'll ask about siblings next.
      </Text>
      <ScrollView contentContainerStyle={styles.content}>
        <AddPhotoCircle
          label={total > 1 ? `Child ${childIndex + 1}'s photo` : "Child's photo"}
          caption="Tap to add · optional"
          imageUri={current.photoUrl}
          uploading={uploadingPhoto}
          onPress={handlePickPhoto}
        />
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
        <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleCropConfirm} />

        <View style={styles.row}>
          <View style={styles.grow}>
            <FieldInput label="Child's name" placeholder="Mia" value={current.name} onChangeText={(name) => updateCurrent({ name })} />
          </View>
          <View style={styles.small}>
            <FieldInput
              label="Age"
              placeholder="6"
              optional
              value={current.age}
              onChangeText={(age) => updateCurrent({ age })}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <FieldInput label="Grade" placeholder="e.g. 1st grade" optional value={current.grade} onChangeText={(grade) => updateCurrent({ grade })} />

        <Text style={styles.label}>NEURODIVERGENCE · SELECT ANY</Text>
        <View style={styles.chips}>
          {NEURODIVERGENCE_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={current.neurodivergence.includes(option)}
              onPress={() => toggleNeurodivergence(option)}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={handleContinue}>
          <Text style={styles.ctaText}>
            {childIndex + 1 < total ? 'Next child' : editMode ? 'Save changes' : 'Continue'}
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
  content: {
    padding: 20,
    paddingTop: 0,
  },
  caption: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  photoError: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 16,
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
