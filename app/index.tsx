import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../components/Photo';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { colors } from '../theme/colors';
import { images } from '../theme/images';

const FEATURES = [
  { title: 'Find your people', subtitle: 'Families who truly get it', image: images.featureFindPeople },
  { title: 'Build community', subtitle: 'Events, groups & shared space', image: images.featureBuildCommunity },
  { title: 'Get real support', subtitle: 'Resources, helpers & guidance', image: images.featureGetSupport },
];

// What the app actually does today, not a generic pitch — each of these
// maps to a real, shipped part of the product (match scoring, direct
// messaging + playdate proposals, TACA-sourced local events, curated
// products/podcasts/articles), so a new family knows what they're
// signing up for rather than just how it feels.
const WHATS_INSIDE = [
  {
    icon: 'people-outline' as const,
    title: 'Matched by what matters',
    subtitle: 'Shared neurodivergence, interests, and schedules — not just a zip code.',
  },
  {
    icon: 'chatbubble-outline' as const,
    title: 'Message & plan playdates',
    subtitle: 'Propose a time and place, then accept, decline, or counter — right in the app.',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Events near you',
    subtitle: 'In-person meetups within driving distance, plus virtual ones.',
  },
  {
    icon: 'bag-outline' as const,
    title: 'Picks made for your kid',
    subtitle: 'Sensory products, podcasts, and articles matched to your child.',
  },
];

function joinCommunity() {
  router.push('/onboarding/account');
}

function signIn() {
  router.push('/sign-in');
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
          Haven.ly is where families of neurodivergent children find each other — matched by what
          actually matters, not just proximity, to build a village that understands.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <Photo source={feature.image} style={styles.featureImage} />
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>WHAT'S INSIDE</Text>
        <View style={styles.insideGrid}>
          {WHATS_INSIDE.map((item) => (
            <View key={item.title} style={styles.insideCard}>
              <View style={styles.insideIconWrap}>
                <Ionicons name={item.icon} size={20} color={colors.surface} />
              </View>
              <Text style={styles.insideTitle}>{item.title}</Text>
              <Text style={styles.insideSubtitle}>{item.subtitle}</Text>
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  insideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  insideCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
  },
  insideIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  insideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  insideSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
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
