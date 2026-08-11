import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddPhotoCircle } from '../../components/AddPhotoCircle';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { photoUploadSupported, pickAndUploadPhoto } from '../../lib/photoUpload';
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
  const { profile, updateProfile } = useOnboarding();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.child.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handlePickPhoto = async () => {
    setPhotoError(null);
    if (!photoUploadSupported()) {
      setPhotoError('Photo upload isn’t available on this platform yet.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadPhoto('child-photo.jpg');
      if (url) setPhotoUrl(url);
    } catch {
      setPhotoError('Couldn’t upload that photo — check your connection and try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = () => {
    const patch = { child: { name, age, grade, neurodivergence: selected, photoUrl } };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/play-style');
    router.push('/onboarding/play-style');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={3} title="About your" accent="little one." />
      <ScrollView contentContainerStyle={styles.content}>
        <AddPhotoCircle
          label="Child's photo"
          caption="Tap to add"
          imageUri={photoUrl}
          uploading={uploadingPhoto}
          onPress={handlePickPhoto}
        />
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}

        <View style={styles.row}>
          <View style={styles.grow}>
            <FieldInput label="Child's name" placeholder="Mia" value={name} onChangeText={setName} />
          </View>
          <View style={styles.small}>
            <FieldInput label="Age" placeholder="6" value={age} onChangeText={setAge} keyboardType="number-pad" />
          </View>
        </View>
        <FieldInput label="Grade" placeholder="e.g. 1st grade" optional value={grade} onChangeText={setGrade} />

        <Text style={styles.label}>NEURODIVERGENCE · SELECT ANY</Text>
        <View style={styles.chips}>
          {NEURODIVERGENCE_OPTIONS.map((option) => (
            <Chip key={option} label={option} selected={selected.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>
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
