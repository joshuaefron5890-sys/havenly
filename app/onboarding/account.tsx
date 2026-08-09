import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { colors } from '../../theme/colors';

const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'];

export default function Account() {
  const [pronoun, setPronoun] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={1} title="Create your" accent="account." />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.half}>
            <FieldInput label="First name" placeholder="Jamie" />
          </View>
          <View style={styles.half}>
            <FieldInput label="Last name" placeholder="Chen" />
          </View>
        </View>
        <FieldInput label="Email" placeholder="jamie@email.com" />
        <FieldInput label="Password" placeholder="6+ characters" />

        <Text style={styles.label}>
          PRONOUNS<Text style={styles.optional}> · optional</Text>
        </Text>
        <View style={styles.chips}>
          {PRONOUNS.map((p) => (
            <Chip key={p} label={p} selected={pronoun === p} onPress={() => setPronoun(p)} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={() => router.push('/onboarding/family')}>
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
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
