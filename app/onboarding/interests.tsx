import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

const INTERESTS: { label: string; emoji: string }[] = [
  { label: 'Minecraft', emoji: '⛏️' },
  { label: 'Roblox', emoji: '🎮' },
  { label: 'Pokémon', emoji: '⚡' },
  { label: 'LEGO', emoji: '🧱' },
  { label: 'Board games', emoji: '🎲' },
  { label: 'Arts & crafts', emoji: '🎨' },
  { label: 'Drawing', emoji: '✏️' },
  { label: 'Music', emoji: '🎵' },
  { label: 'Cats', emoji: '🐱' },
  { label: 'Dogs', emoji: '🐶' },
  { label: 'Other animals', emoji: '🐾' },
  { label: 'Dinosaurs', emoji: '🦕' },
  { label: 'Science', emoji: '🔬' },
  { label: 'Space', emoji: '🚀' },
  { label: 'Reading', emoji: '📚' },
  { label: 'Swimming', emoji: '🏊' },
  { label: 'Building things', emoji: '🔨' },
  { label: 'Soccer', emoji: '⚽' },
];

export default function Interests() {
  const { profile, updateProfile } = useOnboarding();
  const [selected, setSelected] = useState<string[]>(profile.interests);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handleContinue = () => {
    const patch = { interests: selected };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/goals');
    router.push('/onboarding/goals');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={5} title="What are they" accent="really into?" backTo="/onboarding/play-style" />
      <Text style={styles.caption}>Tap to select anything they're into.</Text>
      <ScrollView contentContainerStyle={styles.grid}>
        {INTERESTS.map((interest) => {
          const isSelected = selected.includes(interest.label);
          return (
            <Pressable
              key={interest.label}
              style={[styles.tile, isSelected && styles.tileSelected]}
              onPress={() => toggle(interest.label)}
            >
              <View style={styles.thumbnail}>
                <Text style={styles.emoji}>{interest.emoji}</Text>
              </View>
              <Text style={styles.tileLabel}>{interest.label}</Text>
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
  caption: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  grid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileSelected: {
    borderColor: colors.accent,
  },
  thumbnail: {
    height: 70,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 32,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    padding: 8,
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
