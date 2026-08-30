import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

// Same photo already vetted for the in-app sitter promo card
// (app/proposal/[id].tsx's SITTER_PROMO_IMAGE) — reused here rather than
// picking a new, unvetted Unsplash image.
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585541993027-55373d67ea86?q=80&w=1658&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

const PILLARS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'calendar-outline', label: 'You set your availability' },
  { icon: 'sparkles-outline', label: 'We find you families in need' },
];

function applyNow() {
  router.push('/sitter-signup');
}

function signIn() {
  router.push('/sign-in');
}

// One full-bleed hero, edge to edge — a splash page, not a scrolling
// brochure. Everything sits on top of a single photo + gradient scrim;
// there's no separate "how it works" or feature-grid section below it.
export default function SittersLanding() {
  const isDesktop = useIsDesktop();
  const { height } = useWindowDimensions();

  return (
    <View style={styles.screen}>
      <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.hero} resizeMode="cover">
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
                  Opened <Text style={styles.brandWordmarkAccent}>Circle</Text> for Sitters
                </Text>
              </View>
            </View>

            <View style={styles.spacer} />

            <View style={[styles.bottomCluster, isDesktop && styles.bottomClusterDesktop]}>
              <Text style={styles.eyebrow}>FOR SITTERS, NANNIES &amp; THERAPISTS</Text>
              <Text style={[styles.headline, isDesktop && styles.headlineDesktop]}>
                Get matched with families who <Text style={styles.headlineAccent}>actually need you.</Text>
              </Text>
              <Text style={styles.subtext}>
                Opened Circle connects experienced sitters with local families raising neurodivergent kids.
              </Text>

              <View style={styles.pillarsRow}>
                {PILLARS.map((p) => (
                  <View key={p.label} style={styles.pillar}>
                    <Ionicons name={p.icon} size={13} color="#FFFFFF" />
                    <Text style={styles.pillarText}>{p.label}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={[styles.cta, isDesktop && styles.ctaDesktop]} onPress={applyNow}>
                <Text style={styles.ctaText}>Apply to become a sitter</Text>
              </Pressable>
              <Pressable onPress={signIn}>
                <Text style={styles.signIn}>
                  Already registered? <Text style={styles.signInAccent}>Sign in</Text>
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push('/')}>
                <Text style={styles.familyLink}>Looking for a sitter instead? Go to Opened Circle for families</Text>
              </Pressable>
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
  // A backing chip rather than relying on the gradient alone — see the
  // same fix on app/index.tsx for why.
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
    width: 20,
    height: 20,
  },
  brandWordmark: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  brandWordmarkAccent: {
    color: colors.accent,
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
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.4,
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
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
  ctaDesktop: {
    alignSelf: 'flex-start',
    paddingHorizontal: 36,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signIn: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14,
    marginBottom: 14,
  },
  signInAccent: {
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  familyLink: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
  },
});
