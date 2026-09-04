import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

// A "playdate provider" is a paid chaperone/sitter a family can bring in to
// join or supervise a playdate (see the "Find a sitter for this playdate"
// CTA on Home) — this stores the family's general willingness up front,
// same option-text-as-value pattern as about-you.tsx's `personality`.
const OPTIONS = [
  "Yes, I wouldn't have a playdate without one",
  'No, not right now',
  "I'm open to either",
];

export default function ProviderPreference() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const [providerWillingness, setProviderWillingness] = useState<string | null>(profile.providerWillingness);

  const handleContinue = () => {
    const patch = { providerWillingness };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/calendar', { editMode });
    router.push(editMode ? '/profile' : '/onboarding/calendar');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={10}
        title="Would you use a"
        accent="paid provider?"
        backTo={editMode ? '/profile' : '/onboarding/availability'}
        editMode={editMode}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>WOULD YOU BE WILLING TO PAY FOR A PLAYDATE PROVIDER?</Text>
        <Text style={styles.hint}>A paid sitter or chaperone who joins or supervises a playdate.</Text>
        {OPTIONS.map((option) => {
          const isSelected = providerWillingness === option;
          return (
            <Pressable
              key={option}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => setProviderWillingness(option)}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={handleContinue}>
          <Text style={styles.ctaText}>{editMode ? 'Save changes' : 'Continue'}</Text>
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
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 12,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
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
