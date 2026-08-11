import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { photoUploadSupported, pickAndUploadPhoto } from '../../lib/photoUpload';
import { colors } from '../../theme/colors';

const SIBLING_OPTIONS = ['Almost always', 'Sometimes', 'Usually not', 'Depends on the activity'];

export default function Family() {
  const { profile, updateProfile } = useOnboarding();
  const [children, setChildren] = useState(1);
  const [partnerAtHome, setPartnerAtHome] = useState<boolean | null>(null);
  const [siblings, setSiblings] = useState<string | null>(null);
  const [familyPhotoUrl, setFamilyPhotoUrl] = useState<string | null>(profile.familyPhotoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (!photoUploadSupported()) {
      setPhotoError('Photo upload isn’t available on this platform yet.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadPhoto('family-photo.jpg');
      if (url) setFamilyPhotoUrl(url);
    } catch {
      setPhotoError('Couldn’t upload that photo — check your connection and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = () => {
    const patch = { numChildren: children, partnerAtHome, siblingsIncluded: siblings, familyPhotoUrl };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/child');
    router.push('/onboarding/child');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={2} title="Tell us about" accent="your family." />
      <ScrollView contentContainerStyle={styles.content}>
        <AddPhotoCircle
          label="Your photo"
          caption="Shown to matches"
          imageUri={familyPhotoUrl}
          uploading={uploadingPhoto}
          onPress={handlePickPhoto}
        />
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}

        <Text style={styles.label}>NUMBER OF CHILDREN</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepperButton} onPress={() => setChildren(Math.max(1, children - 1))}>
            <Ionicons name="remove" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.stepperValue}>{children}</Text>
          <Pressable style={[styles.stepperButton, styles.stepperButtonActive]} onPress={() => setChildren(children + 1)}>
            <Ionicons name="add" size={18} color={colors.surface} />
          </Pressable>
          <Text style={styles.stepperCaption}>child at home</Text>
        </View>

        <Text style={styles.label}>PARTNER OR CO-PARENT AT HOME?</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <Pressable
              style={[styles.optionButton, partnerAtHome === true && styles.optionButtonSelected]}
              onPress={() => setPartnerAtHome(true)}
            >
              <Text style={[styles.optionText, partnerAtHome === true && styles.optionTextSelected]}>Yes</Text>
            </Pressable>
          </View>
          <View style={styles.half}>
            <Pressable
              style={[styles.optionButton, partnerAtHome === false && styles.optionButtonSelected]}
              onPress={() => setPartnerAtHome(false)}
            >
              <Text style={[styles.optionText, partnerAtHome === false && styles.optionTextSelected]}>No</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>ARE SIBLINGS USUALLY INCLUDED?</Text>
        {SIBLING_OPTIONS.map((option) => (
          <Pressable key={option} style={styles.radioRow} onPress={() => setSiblings(option)}>
            <View style={[styles.radio, siblings === option && styles.radioSelected]} />
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={handleContinue}>
          <Text style={styles.ctaText}>Continue</Text>
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
  photoError: {
    fontSize: 12,
    color: colors.error,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonActive: {
    backgroundColor: colors.accent,
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  stepperCaption: {
    fontSize: 14,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  half: {
    flex: 1,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.accent,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
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
