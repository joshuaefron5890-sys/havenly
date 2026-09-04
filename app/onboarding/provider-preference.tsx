import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../../components/FieldInput';
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

// The two options where a max rate is actually worth asking about — "No,
// not right now" skips straight to Continue.
const RATE_OPTIONS = [OPTIONS[0], OPTIONS[2]];

export default function ProviderPreference() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const [providerWillingness, setProviderWillingness] = useState<string | null>(profile.providerWillingness);
  const [maxHourlyRate, setMaxHourlyRate] = useState(profile.providerMaxHourlyRate);
  const showRateQuestion = providerWillingness !== null && RATE_OPTIONS.includes(providerWillingness);

  const selectWillingness = (option: string) => {
    setProviderWillingness(option);
    // Switching to "No, not right now" makes a previously entered rate
    // stale — clear it rather than silently carrying it into the saved
    // profile alongside an answer that says a provider isn't wanted.
    if (!RATE_OPTIONS.includes(option)) setMaxHourlyRate('');
  };

  const handleContinue = () => {
    const patch = { providerWillingness, providerMaxHourlyRate: showRateQuestion ? maxHourlyRate.trim() : '' };
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
              onPress={() => selectWillingness(option)}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}

        {showRateQuestion ? (
          <View style={styles.rateSection}>
            <FieldInput
              label="Max hourly rate you'd pay"
              placeholder="$20/hr"
              keyboardType="decimal-pad"
              value={maxHourlyRate}
              onChangeText={setMaxHourlyRate}
            />
            <Text style={styles.footnote}>
              *This doesn't mean you'll automatically be matched at your maximum.
            </Text>
          </View>
        ) : null}
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
  rateSection: {
    marginTop: 8,
  },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -8,
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
