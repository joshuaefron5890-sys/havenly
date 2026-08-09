import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

const FEATURES = [
  { title: 'Find your people', subtitle: 'Families who truly get it' },
  { title: 'Build community', subtitle: 'Events, groups & shared space' },
  { title: 'Get real support', subtitle: 'Resources, helpers & guidance' },
];

function enterApp() {
  router.replace('/(tabs)');
}

export default function Onboarding() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero} />

        <Text style={styles.headline}>A community</Text>
        <Text style={styles.headlineAccent}>built around your child.</Text>
        <Text style={styles.subtext}>
          Haven.ly is where families of neurodivergent children find each other — to connect,
          share, and build a village that actually understands.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <View style={styles.featureImage} />
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.cta} onPress={enterApp}>
          <Text style={styles.ctaText}>Join the community</Text>
        </Pressable>

        <Pressable onPress={enterApp}>
          <Text style={styles.signIn}>
            Already a member? <Text style={styles.signInAccent}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
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
    paddingBottom: 40,
  },
  hero: {
    height: 220,
    borderRadius: 24,
    backgroundColor: colors.accentMuted,
    marginBottom: 20,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
  },
  headlineAccent: {
    fontSize: 30,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.accent,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 20,
  },
  features: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  featureCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
  },
  featureImage: {
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.accentMuted,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  featureSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  signIn: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
  signInAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
});
