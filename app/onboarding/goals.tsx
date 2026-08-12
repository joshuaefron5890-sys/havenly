import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

const GOALS = [
  'A close friend for my child',
  'Regular playdates',
  'Occasional playdates',
  'Parent friendships',
  'Whole-family friendships',
  'Families who understand neurodivergence',
  'Weekend get-togethers',
  'After-school hangouts',
  'Parents to talk to (without the kids)',
  'Larger group activities',
  'Families with similar experiences',
  'Something else',
];

export default function Goals() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const [selected, setSelected] = useState<string[]>(profile.goals);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handleContinue = () => {
    const patch = { goals: selected };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/about-you');
    router.push(editMode ? '/profile' : '/onboarding/about-you');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={7}
        title="What are you"
        accent="hoping to find?"
        backTo={editMode ? '/profile' : '/onboarding/interests'}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>SELECT ALL THAT APPLY</Text>
        {GOALS.map((goal) => {
          const isSelected = selected.includes(goal);
          return (
            <Pressable key={goal} style={[styles.option, isSelected && styles.optionSelected]} onPress={() => toggle(goal)}>
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{goal}</Text>
            </Pressable>
          );
        })}
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionSelected: {
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
