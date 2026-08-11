import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { emptySiblingProfile, SiblingProfile, useOnboarding } from '../../contexts/OnboardingContext';
import { numSiblings, stepBeforeSiblings } from '../../lib/onboardingFlow';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

export default function Siblings() {
  const { profile, updateProfile } = useOnboarding();
  const total = Math.max(
    1,
    numSiblings({ numChildren: profile.numChildren, numNeurodivergentChildren: profile.numNeurodivergentChildren })
  );
  const [siblingIndex, setSiblingIndex] = useState(0);
  const [siblingsData, setSiblingsData] = useState<SiblingProfile[]>(() =>
    Array.from({ length: total }, (_, i) => profile.siblingProfiles[i] ?? { ...emptySiblingProfile })
  );
  const [error, setError] = useState<string | null>(null);

  const current = siblingsData[siblingIndex];

  const updateCurrent = (patch: Partial<SiblingProfile>) => {
    setSiblingsData((prev) => prev.map((s, i) => (i === siblingIndex ? { ...s, ...patch } : s)));
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
    saveOnboardingStep(patch, '/onboarding/play-style');
    router.push('/onboarding/play-style');
  };

  const handleBack = () => {
    if (siblingIndex > 0) {
      setError(null);
      setSiblingIndex(siblingIndex - 1);
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
      />
      <Text style={styles.caption}>Just the basics — this helps us find playdates that work for the whole family.</Text>
      <ScrollView contentContainerStyle={styles.content}>
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
        <FieldInput
          label="Interests"
          placeholder="e.g. soccer, drawing, dinosaurs"
          optional
          value={current.interests}
          onChangeText={(interests) => updateCurrent({ interests })}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={handleContinue}>
          <Text style={styles.ctaText}>{siblingIndex + 1 < total ? 'Next sibling' : 'Continue'}</Text>
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
