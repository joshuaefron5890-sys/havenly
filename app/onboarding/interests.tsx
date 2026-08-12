import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

const INTERESTS = [
  { label: 'Minecraft', image: images.interestMinecraft },
  { label: 'Roblox', image: images.interestRoblox },
  { label: 'Pokémon', image: images.interestPokemon },
  { label: 'LEGO', image: images.interestLego },
  { label: 'Board games', image: images.interestBoardGames },
  { label: 'Arts & crafts', image: images.interestArtsCrafts },
  { label: 'Drawing', image: images.interestDrawing },
  { label: 'Music', image: images.interestMusic },
  { label: 'Cats', image: images.interestCats },
  { label: 'Dogs', image: images.interestDogs },
  { label: 'Other animals', image: images.interestOtherAnimals },
  { label: 'Dinosaurs', image: images.interestDinosaurs },
  { label: 'Science', image: images.interestScience },
  { label: 'Space', image: images.interestSpace },
  { label: 'Reading', image: images.interestReading },
  { label: 'Swimming', image: images.interestSwimming },
  { label: 'Building things', image: images.interestBuildingThings },
  { label: 'Soccer', image: images.interestSoccer },
];

export default function Interests() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editMode = edit === '1';
  const { profile, updateProfile } = useOnboarding();
  const [selected, setSelected] = useState<string[]>(profile.interests);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handleContinue = () => {
    const patch = { interests: selected };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/goals');
    router.push(editMode ? '/profile' : '/onboarding/goals');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={6}
        title="What are they"
        accent="really into?"
        backTo={editMode ? '/profile' : '/onboarding/play-style'}
      />
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
              <Photo source={interest.image} style={styles.thumbnail} />
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
