import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { WizardHeader } from '../../components/WizardHeader';
import { ChildProfile, useOnboarding } from '../../contexts/OnboardingContext';
import { stepBeforePlayStyle } from '../../lib/onboardingFlow';
import { saveOnboardingStep } from '../../lib/onboardingProgress';
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

// "How does Ava like to play?" for one neurodivergent child, "How do Ava and
// Ben like to play?" for more than one — the question (and the fields below)
// repeat once per neurodivergent child, since play style is personal to them.
function playHeading(names: string[]): { title: string; accent: string } {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return { title: 'How do they', accent: 'like to play?' };
  if (clean.length === 1) return { title: `How does ${clean[0]}`, accent: 'like to play?' };
  const joined = clean.length === 2 ? clean.join(' and ') : `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
  return { title: `How do ${joined}`, accent: 'like to play?' };
}

export default function PlayStyle() {
  const { profile, updateProfile } = useOnboarding();
  const [childrenData, setChildrenData] = useState<ChildProfile[]>(profile.children);

  const toggleStyle = (index: number, option: string) => {
    setChildrenData((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const next = c.playStyle.includes(option) ? c.playStyle.filter((o) => o !== option) : [...c.playStyle, option];
        return { ...c, playStyle: next };
      })
    );
  };

  const setLength = (index: number, length: string) => {
    setChildrenData((prev) => prev.map((c, i) => (i === index ? { ...c, idealPlaydateLength: length } : c)));
  };

  const handleContinue = () => {
    const patch = { children: childrenData };
    updateProfile(patch);
    saveOnboardingStep(patch, '/onboarding/interests');
    router.push('/onboarding/interests');
  };

  const heading = playHeading(childrenData.map((c) => c.name));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader
        step={5}
        title={heading.title}
        accent={heading.accent}
        backTo={stepBeforePlayStyle({
          numChildren: profile.numChildren,
          numNeurodivergentChildren: profile.numNeurodivergentChildren,
        })}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {childrenData.length === 0 ? (
          <Text style={styles.empty}>No neurodivergent child info yet — head back and add one to personalize this.</Text>
        ) : (
          childrenData.map((child, index) => (
            <View key={index} style={index > 0 && styles.childSection}>
              {childrenData.length > 1 ? <Text style={styles.childName}>{child.name || `Child ${index + 1}`}</Text> : null}

              <Text style={styles.label}>PLAY STYLE · SELECT ALL THAT APPLY</Text>
              <View style={styles.chips}>
                {PLAY_STYLES.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={child.playStyle.includes(option)}
                    onPress={() => toggleStyle(index, option)}
                  />
                ))}
              </View>

              <Text style={styles.label}>IDEAL PLAYDATE LENGTH</Text>
              <View style={styles.chips}>
                {PLAYDATE_LENGTHS.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={child.idealPlaydateLength === option}
                    onPress={() => setLength(index, option)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
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
  empty: {
    fontSize: 14,
    color: colors.textMuted,
  },
  childSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  childName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
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
