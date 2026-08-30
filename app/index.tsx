import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { useIsDesktop } from '../lib/responsive';
import { SITTERS_ENABLED } from '../lib/sitters';
import { colors } from '../theme/colors';
import { images } from '../theme/images';

const PILLARS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'people-outline', label: 'Find your people' },
  { icon: 'chatbubbles-outline', label: 'Build community' },
  { icon: 'heart-outline', label: 'Get real support' },
];

function joinCommunity() {
  router.push('/onboarding/account');
}

function signIn() {
  router.push('/sign-in');
}

function becomeSitter() {
  router.push('/sitters');
}

// Shared between both layouts so the CTA/links block never drifts out of
// sync between them.
function JoinLinks() {
  return (
    <>
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
      <Pressable onPress={() => router.push('/privacy')}>
        <Text style={styles.privacyLink}>Privacy Policy</Text>
      </Pressable>
    </>
  );
}

// One full-bleed hero, edge to edge — same treatment as app/sitters.tsx's
// landing page, for a consistent "arriving somewhere" first impression
// instead of a scrolling brochure of feature cards.
export default function Landing() {
  const { user, loading } = useAuth();
  const { updateProfile } = useOnboarding();
  const isDesktop = useIsDesktop();
  const { height } = useWindowDimensions();

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
    <View style={styles.screen}>
      <ImageBackground source={images.onboardingHero} style={styles.hero} resizeMode="cover">
        <LinearGradient
          colors={['rgba(20, 18, 16, 0.55)', 'rgba(20, 18, 16, 0.78)', 'rgba(20, 18, 16, 0.95)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={[styles.scrollContent, { minHeight: height }]} bounces={false}>
            <View style={[styles.topRow, isDesktop && styles.topRowDesktop]}>
              <View style={styles.brandChip}>
                <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
                <Text style={styles.brandWordmark}>
                  Haven<Text style={styles.brandWordmarkAccent}>.ly</Text>
                </Text>
              </View>
            </View>

            <View style={styles.spacer} />

            <View style={[styles.bottomCluster, isDesktop && styles.bottomClusterDesktop]}>
              <Text style={[styles.headline, isDesktop && styles.headlineDesktop]}>
                A community built for <Text style={styles.headlineAccent}>neurodivergent families.</Text>
              </Text>
              <Text style={styles.subtext}>
                Haven.ly helps families with neurodivergent children connect with others in their local
                community.
              </Text>

              <View style={styles.pillarsRow}>
                {PILLARS.map((p) => (
                  <View key={p.label} style={styles.pillar}>
                    <Ionicons name={p.icon} size={13} color="#FFFFFF" />
                    <Text style={styles.pillarText}>{p.label}</Text>
                  </View>
                ))}
              </View>

              <JoinLinks />
            </View>
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#141210',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  hero: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topRowDesktop: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  // A backing chip rather than relying on the gradient alone — the hero
  // photo's brightness varies by crop/screen size, and the top of the
  // gradient is deliberately the lightest part of it, so the logo mark
  // (its own fixed colors, can't take a text shadow) needs a guaranteed
  // dark patch behind it no matter what's in that corner of the photo.
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 18, 16, 0.45)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  brandMark: {
    width: 22,
    height: 22,
  },
  brandWordmark: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  brandWordmarkAccent: {
    color: colors.accent,
    fontStyle: 'italic',
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  bottomCluster: {
    paddingBottom: 8,
  },
  bottomClusterDesktop: {
    maxWidth: 620,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headline: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 40,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  headlineDesktop: {
    fontSize: 52,
    lineHeight: 58,
  },
  headlineAccent: {
    fontStyle: 'italic',
    color: colors.accent,
  },
  subtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    lineHeight: 23,
    marginBottom: 20,
    maxWidth: 460,
  },
  pillarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 26,
  },
  pillar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pillarText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 14,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signIn: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14,
    marginBottom: 12,
  },
  signInAccent: {
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  privacyLink: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 4,
  },
});
