import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

// Same photo already vetted for the in-app sitter promo card
// (app/proposal/[id].tsx's SITTER_PROMO_IMAGE) — reused here rather than
// picking a new, unvetted Unsplash image.
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585541993027-55373d67ea86?q=80&w=1658&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'sparkles-outline',
    title: 'Get matched, not just listed',
    body: "Families searching for care that understands their kid's needs find you first — not another anonymous sitter profile in a generic directory.",
  },
  {
    icon: 'calendar-outline',
    title: 'Your schedule, your rules',
    body: 'Mark exactly when you\'re free. Sync your Google Calendar and it stays current on its own — no more back-and-forth texts about availability.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Vetted once, visible everywhere',
    body: 'Complete one background check, and every family on Haven.ly can find and request you — no re-applying gig by gig.',
  },
  {
    icon: 'cash-outline',
    title: 'You set your rate',
    body: 'Your hourly rate is right on your profile, agreed before a family ever reaches out — no awkward negotiating.',
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Apply & get verified',
    body: 'Tell us about your experience and certifications. We run a background check so families can trust who they\'re booking.',
  },
  {
    title: 'Set your availability',
    body: "Mark when you're free — tied to real playdate slots families are already planning, not vague gig postings.",
  },
  {
    title: 'Get matched & confirmed',
    body: 'Families request you for specific playdates that fit your availability. You confirm what actually works for you.',
  },
];

function applyNow() {
  router.push('/sitter-signup');
}

function signIn() {
  router.push('/sign-in');
}

// Shared between both layouts so the CTA/sign-in link never drifts out of
// sync between them.
function ApplyLinks() {
  return (
    <>
      <Pressable style={styles.cta} onPress={applyNow}>
        <Text style={styles.ctaText}>Apply to become a sitter</Text>
      </Pressable>
      <Pressable onPress={signIn}>
        <Text style={styles.signIn}>
          Already registered? <Text style={styles.signInAccent}>Sign in</Text>
        </Text>
      </Pressable>
    </>
  );
}

function BenefitCard({ item, desktop }: { item: (typeof BENEFITS)[number]; desktop?: boolean }) {
  return (
    <View style={[styles.benefitCard, desktop && styles.benefitCardDesktop]}>
      <View style={styles.benefitIcon}>
        <Ionicons name={item.icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.benefitTitle}>{item.title}</Text>
      <Text style={styles.benefitBody}>{item.body}</Text>
    </View>
  );
}

export default function SittersLanding() {
  const isDesktop = useIsDesktop();

  const benefitsGrid = (
    <View style={[styles.benefitsGrid, isDesktop && styles.benefitsGridDesktop]}>
      {BENEFITS.map((item) => (
        <BenefitCard key={item.title} item={item} desktop={isDesktop} />
      ))}
    </View>
  );

  const stepsList = (
    <View style={styles.stepsList}>
      {STEPS.map((step, i) => (
        <View key={step.title} style={styles.stepRow}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{i + 1}</Text>
          </View>
          <View style={styles.stepTextWrap}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  if (isDesktop) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.contentDesktop}>
          <View style={styles.heroRowDesktop}>
            <View style={styles.heroCopyDesktop}>
              <View style={styles.brandRow}>
                <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
                <Text style={styles.brandWordmark}>
                  Haven<Text style={styles.brandWordmarkAccent}>.ly</Text> for Sitters
                </Text>
              </View>
              <Text style={[styles.headline, styles.headlineDesktop]}>
                Get matched with families who <Text style={styles.headlineAccent}>actually need you.</Text>
              </Text>
              <Text style={styles.subtext}>
                Haven.ly connects experienced sitters, nannies, and therapists with local families raising
                neurodivergent kids — so you spend less time hunting for gigs and more time doing what
                you're good at.
              </Text>
              <View style={styles.desktopLinks}>
                <ApplyLinks />
              </View>
            </View>
            <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.heroImageDesktop} imageStyle={styles.heroImageInner} />
          </View>

          {benefitsGrid}

          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.stepsListDesktop}>{stepsList}</View>

          <View style={styles.bottomCtaDesktop}>
            <Text style={styles.bottomCtaTitle}>Ready to get started?</Text>
            <ApplyLinks />
          </View>

          <Pressable onPress={() => router.push('/')}>
            <Text style={styles.familyLink}>Looking for a sitter instead? Go to Haven.ly for families</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
          <Text style={styles.brandWordmark}>
            Haven<Text style={styles.brandWordmarkAccent}>.ly</Text> for Sitters
          </Text>
        </View>

        <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.hero} imageStyle={styles.heroInner}>
          <View style={styles.heroScrim} />
          <Text style={styles.heroHeadline}>
            Get matched with families who <Text style={styles.headlineAccent}>actually need you.</Text>
          </Text>
        </ImageBackground>

        <Text style={styles.subtext}>
          Haven.ly connects experienced sitters, nannies, and therapists with local families raising
          neurodivergent kids — so you spend less time hunting for gigs and more time doing what you're
          good at.
        </Text>

        {benefitsGrid}

        <Text style={styles.sectionTitle}>How it works</Text>
        {stepsList}

        <ApplyLinks />

        <Pressable onPress={() => router.push('/')}>
          <Text style={styles.familyLink}>Looking for a sitter instead? Go to Haven.ly for families</Text>
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
    overflow: 'hidden',
    backgroundColor: colors.accentMuted,
    marginBottom: 20,
    justifyContent: 'flex-end',
    padding: 18,
  },
  heroInner: {
    borderRadius: 24,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 24, 27, 0.42)',
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 32,
  },
  // Overlaid on the hero photo (behind heroScrim) rather than sitting on
  // the plain page background like `headline` — needs white text and a
  // shadow for legibility over an arbitrary photo instead of `headline`'s
  // near-black.
  heroHeadline: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headlineDesktop: {
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
  },
  headlineAccent: {
    fontStyle: 'italic',
    color: colors.accent,
  },
  subtext: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 22,
  },
  benefitsGrid: {
    gap: 12,
    marginBottom: 26,
  },
  benefitsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  benefitCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  benefitCardDesktop: {
    width: '48%',
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  benefitBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  stepsList: {
    gap: 18,
    marginBottom: 28,
  },
  stepsListDesktop: {
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
  },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
  stepTextWrap: {
    flex: 1,
    paddingTop: 3,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  stepBody: {
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
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
  familyLink: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  // ---- desktop-only ----
  contentDesktop: {
    padding: 48,
    maxWidth: 1040,
    width: '100%',
    alignSelf: 'center',
  },
  heroRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 56,
    marginBottom: 48,
  },
  heroCopyDesktop: {
    flex: 1,
    maxWidth: 440,
  },
  heroImageDesktop: {
    flex: 1,
    height: 360,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.accentMuted,
  },
  heroImageInner: {
    borderRadius: 24,
  },
  desktopLinks: {
    marginTop: 8,
    maxWidth: 320,
  },
  bottomCtaDesktop: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  bottomCtaTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
});
