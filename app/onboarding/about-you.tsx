import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

const PERSONALITY = [
  'Loves getting to know other parents',
  "Chatty, but doesn't need a new best friend",
  'Mostly there for the kids',
  'Takes a little while to warm up',
  'Loves bringing families together',
  'Happiest in small groups',
];

const SOUNDS_GOOD = ['Coffee', 'Dinner', 'Walking', 'Family BBQs', 'Day trips', 'Kids activities together', 'Talking parenting'];

export default function AboutYou() {
  const { profile, updateProfile } = useOnboarding();
  const [personality, setPersonality] = useState<string | null>(profile.personality);
  const [soundsGood, setSoundsGood] = useState<string[]>(profile.soundsGoodTo);

  const toggle = (option: string) => {
    setSoundsGood((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handleContinue = () => {
    const patch = { personality, soundsGoodTo: soundsGood };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/availability');
    router.push('/onboarding/availability');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={8} title="Now, a little" accent="about you." backTo="/onboarding/goals" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>AT A GET-TOGETHER, YOU'RE USUALLY...</Text>
        {PERSONALITY.map((option) => {
          const isSelected = personality === option;
          return (
            <Pressable key={option} style={[styles.option, isSelected && styles.optionSelected]} onPress={() => setPersonality(option)}>
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.label}>WHAT SOUNDS GOOD TO YOU?</Text>
        <View style={styles.chips}>
          {SOUNDS_GOOD.map((option) => (
            <Chip key={option} label={option} selected={soundsGood.includes(option)} onPress={() => toggle(option)} />
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 12,
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
