import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../components/Photo';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { SITTERS_ENABLED } from '../lib/sitters';
import { colors } from '../theme/colors';
import { images } from '../theme/images';

// What the app actually does today, not a generic pitch — each subtitle
// names the real, shipped part of the product behind that pillar (match
// scoring; direct messaging, playdate proposals, and local events from
// TACA and regional family-support orgs; curated products/podcasts/
// articles), so a new family knows what they're signing up for rather
// than just how it feels.
const FEATURES = [
  {
    title: 'Find your people',
    subtitle: 'Matched by shared neurodivergence, interests, and schedules, not just a zip code.',
    image: images.featureFindPeople,
  },
  {
    title: 'Build community',
    subtitle: 'Message families, propose playdates, and find events near you, in person or virtual.',
    image: images.featureBuildCommunity,
  },
  {
    title: 'Get real support',
    subtitle: 'Sensory products, podcasts, and articles curated for your child.',
    image: images.featureGetSupport,
  },
];

function joinCommunity() {
  router.push('/onboarding/account');
}

function signIn() {
  router.push('/sign-in');
}

function becomeSitter() {
  router.push('/sitter-signup');
}

export default function Onboarding() {
  const { user, loading } = useAuth();
  const { updateProfile } = useOnboarding();

  // A signed-in user should never see the landing page — but they also
  // shouldn't get dumped into the tabs if they never finished onboarding.
  // Resume them at whichever step they last saved progress on instead.
  useEffect(() => {
    if (loading || !user) return;
    routeSignedInUser(user, updateProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading || user) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
          <Text style={styles.brandWordmark}>
            Haven<Text style={styles.brandWordmarkAccent}>.ly</Text>
          </Text>
        </View>

        <Photo source={images.onboardingHero} style={styles.hero} />

        <Text style={styles.headline}>A community</Text>
        <Text style={styles.headlineAccent}>built around your child.</Text>
        <Text style={styles.subtext}>
          Haven.ly is where families of neurodivergent children find each other. We match by what
          actually matters, not just proximity, so you can build a village that understands.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <Photo source={feature.image} style={styles.featureImage} />
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.cta} onPress={joinCommunity}>
          <Text style={styles.ctaText}>Join the community</Text>
        </Pressable>

        <Pressable onPress={signIn}>
          <Text style={styles.signIn}>
            Already a member? <Text style={styles.signInAccent}>Sign in</Text>
          </Text>
        </Pressable>
        {SITTERS_ENABLED ? (
          <Pressable onPress={becomeSitter}>
            <Text style={styles.signIn}>
              Babysitter, nanny, or therapist? <Text style={styles.signInAccent}>Register as a sitter</Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  brandMark: {
    width: 22,
    height: 22,
  },
  brandWordmark: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  brandWordmarkAccent: {
    color: colors.accent,
    fontStyle: 'italic',
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
    gap: 10,
    marginBottom: 24,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
  },
  featureImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  featureSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 3,
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
    marginBottom: 12,
  },
  signInAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
});
