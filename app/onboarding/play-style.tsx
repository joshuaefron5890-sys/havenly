import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { WizardHeader } from '../../components/WizardHeader';
import { colors } from '../../theme/colors';

const PLAY_STYLES = [
  'Jumps right in',
  'Needs to warm up',
  'Prefers one-on-one',
  'Loves small groups',
  'Parallel play',
  'Collaborative play',
  'Prefers structure',
  'Loves free play',
];

const PLAYDATE_LENGTHS = ['< 1 hour', '1–2 hours', '2–3 hours', 'Half a day', 'It depends'];

export default function PlayStyle() {
  const [styles_, setStyles] = useState<string[]>([]);
  const [length, setLength] = useState<string | null>(null);

  const toggle = (option: string) => {
    setStyles((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={4} title="How do they" accent="like to play?" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>PLAY STYLE · SELECT ALL THAT APPLY</Text>
        <View style={styles.chips}>
          {PLAY_STYLES.map((option) => (
            <Chip key={option} label={option} selected={styles_.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>

        <Text style={styles.label}>ENERGY LEVEL</Text>
        <View style={styles.energyRow}>
          <Text style={styles.energyCaption}>Calm & quiet</Text>
          <Text style={styles.energyCaption}>High energy</Text>
        </View>
        <View style={styles.energyTrack}>
          <View style={styles.energyFill} />
        </View>

        <Text style={styles.label}>IDEAL PLAYDATE LENGTH</Text>
        <View style={styles.chips}>
          {PLAYDATE_LENGTHS.map((option) => (
            <Chip key={option} label={option} selected={length === option} onPress={() => setLength(option)} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={() => router.push('/onboarding/interests')}>
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
    marginTop: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  energyCaption: {
    fontSize: 13,
    color: colors.textMuted,
  },
  energyTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  energyFill: {
    width: '50%',
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
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
