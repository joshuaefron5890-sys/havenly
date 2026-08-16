import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';
import { INTERESTS } from '../../theme/interests';

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
    saveOnboardingStep(patch, '/onboarding/goals', { editMode });
    router.push(editMode ? '/profile' : '/onboarding/goals');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={6}
        title="What are they"
        accent="really into?"
        backTo={editMode ? '/profile' : '/onboarding/play-style'}
        editMode={editMode}
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
