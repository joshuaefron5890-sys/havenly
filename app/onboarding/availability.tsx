import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
import { colors } from '../../theme/colors';

const WEEKDAYS = ['Before school', 'After school', 'Evenings'];
const WEEKENDS = ['Saturday morning', 'Saturday afternoon', 'Saturday evening', 'Sunday morning', 'Sunday afternoon', 'Sunday evening'];

export default function Availability() {
  const { updateProfile } = useOnboarding();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  const handleContinue = () => {
    const patch = { availability: selected };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/calendar');
    router.push('/onboarding/calendar');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={8} title="When do playdates" accent="usually work?" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>WEEKDAYS</Text>
        <View style={styles.chips}>
          {WEEKDAYS.map((option) => (
            <Chip key={option} label={option} selected={selected.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>

        <Text style={styles.label}>WEEKENDS</Text>
        <View style={styles.chips}>
          {WEEKENDS.map((option) => (
            <Chip key={option} label={option} selected={selected.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>

        <View style={styles.note}>
          <Ionicons name="calendar-outline" size={18} color={colors.positive} />
          <Text style={styles.noteText}>
            On the next screen you can connect your calendar so we find times that actually work. We only ever see
            Free/Busy — never the details.
          </Text>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.positiveMuted,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
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
