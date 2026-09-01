import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { forwardRef, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextProps,
  View,
} from 'react-native';
import { Text as AppText } from '../components/AppText';
import { FieldInput } from '../components/FieldInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

// This page's body/UI font is Geist (per the reference it was built to
// match) rather than the rest of the app's DM Sans — loaded alongside
// the other page-specific font (Lora, for the large headlines) via the
// same shared useFonts call in app/_layout.tsx. Wrapping AppText's Text
// here, instead of setting fontFamily on every individual style below,
// means every plain <Text> in this file gets Geist automatically;
// anywhere that already sets its own fontFamily (the Lora headline
// styles) still wins, since that comes later in the merged style array.
function resolveGeistFamily(fontWeight?: string | number, italic?: boolean): string {
  const isBold =
    fontWeight === 'bold' || (typeof fontWeight === 'string' ? parseInt(fontWeight, 10) >= 600 : (fontWeight ?? 0) >= 600);
  if (isBold) return italic ? 'Geist_700Bold_Italic' : 'Geist_700Bold';
  if (fontWeight === '500' || fontWeight === 500) return italic ? 'Geist_500Medium_Italic' : 'Geist_500Medium';
  return italic ? 'Geist_400Regular_Italic' : 'Geist_400Regular';
}

const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontFamily = resolveGeistFamily(flat.fontWeight, flat.fontStyle === 'italic');
  return <AppText ref={ref} style={[{ fontFamily }, style]} {...props} />;
});

// Same photo already vetted for the in-app sitter promo card
// (app/proposal/[id].tsx's SITTER_PROMO_IMAGE) — reused here rather than
// picking a new, unvetted Unsplash image, standing in for the reference
// design's AI-generated illustration.
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585541993027-55373d67ea86?q=80&w=1658&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

// The reference page's accent reads as a deeper forest green than this
// app's own brighter colors.accent (#2A9D8F — deliberately brightened
// earlier for legibility on a photo background elsewhere). #196C54 is
// the exact hex given for this page — used here instead of the global
// token so this one page matches the reference precisely without
// touching the accent everywhere else in the app.
const ACCENT = '#196C54';
const ACCENT_MUTED = '#D6E5E0';

const BACKGROUND_OPTIONS = [
  'Registered behavior technician (RBT) or behavior technician',
  'Special education teacher or classroom aide',
  'Paraeducator or inclusion aide',
  'Speech-language pathology, occupational therapy, psychology, or education student',
  'Respite care or adaptive recreation worker',
  'Experienced nanny or caregiver',
  'Sibling or volunteer with experience supporting neurodivergent children and/or children with disabilities',
  'Other relevant experience',
];

const EXPERIENCE_ITEMS = [
  'Behavior technicians, special educators, and classroom or inclusion aides',
  'Students in speech-language pathology, OT, psychology, or education',
  'Respite workers, adaptive recreation staff, nannies, and caregivers',
  'Siblings and volunteers with experience supporting neurodivergent children',
];

const STEPS = [
  { number: '01', title: 'Tell us about yourself', body: 'Share your experience and the children you feel comfortable supporting.' },
  { number: '02', title: 'Complete the screening process', body: 'We’ll review your experience, references, identity, and standard safety checks.' },
  { number: '03', title: 'Find work that fits your life', body: 'Set your availability and choose opportunities that fit your life.' },
];

const TRUST_ITEMS: { icon: keyof typeof Ionicons.glyphMap; bold: string; rest: string }[] = [
  { icon: 'time-outline', bold: 'Flexible', rest: 'evenings & weekends' },
  { icon: 'location-outline', bold: 'Local', rest: 'Peninsula families' },
  { icon: 'cash-outline', bold: '100%', rest: 'of your hourly rate' },
];

function signIn() {
  router.push('/sign-in');
}

export default function SittersLanding() {
  const isDesktop = useIsDesktop();
  const scrollRef = useRef<ScrollView>(null);
  const roleY = useRef(0);
  const howY = useRef(0);
  const formY = useRef(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [zip, setZip] = useState('');
  const [background, setBackground] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const scrollToRole = () => scrollRef.current?.scrollTo({ y: roleY.current, animated: true });
  const scrollToHow = () => scrollRef.current?.scrollTo({ y: howY.current, animated: true });
  const scrollToForm = () => scrollRef.current?.scrollTo({ y: formY.current, animated: true });

  // Not wired to any backend yet — just a local confirmation state,
  // per the ask to host this page while the real interest-list workflow
  // (where these entries actually go) still gets figured out.
  const handleSubmit = () => {
    setError(null);
    if (!name.trim() || !email.trim() || !zip.trim() || !background) {
      setError('Fill in every field to join the interest list.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Nav */}
        <View style={[styles.nav, isDesktop && styles.navDesktop]}>
          <Pressable style={styles.brandRow} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
            <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.brandWordmark}>Opened Circle</Text>
          </Pressable>
          {isDesktop ? (
            <View style={styles.navLinks}>
              <Pressable onPress={scrollToRole}>
                <Text style={styles.navLink}>The role</Text>
              </Pressable>
              <Pressable onPress={scrollToHow}>
                <Text style={styles.navLink}>How it works</Text>
              </Pressable>
              <Pressable onPress={scrollToForm} style={styles.navCta}>
                <Text style={styles.navCtaText}>Sign Up</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.surface} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={scrollToForm} style={styles.navCta}>
              <Text style={styles.navCtaText}>Sign Up</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.surface} />
            </Pressable>
          )}
        </View>

        {/* Hero */}
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          <View style={[styles.heroCopy, isDesktop && styles.heroCopyDesktop]}>
            <View style={styles.eyebrow}>
              <Ionicons name="location-outline" size={13} color={ACCENT} />
              <Text style={styles.eyebrowText}>Now forming in the Bay Area</Text>
            </View>
            <Text style={[styles.headline, isDesktop && styles.headlineDesktop]}>
              You can open <Text style={styles.headlineAccent}>a child’s world.</Text>
            </Text>
            <Text style={styles.lede}>
              Find flexible, well-paid opportunities helping neurodivergent children build connections through
              everyday experiences.
            </Text>
            <View style={styles.heroActions}>
              <Pressable style={styles.primaryButton} onPress={scrollToForm}>
                <Text style={styles.primaryButtonText}>Become a founding provider</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.surface} />
              </Pressable>
              <Pressable style={styles.secondaryLinkWrap} onPress={scrollToRole}>
                <Text style={styles.secondaryLink}>See what the role involves</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.heroVisual, isDesktop && styles.heroVisualDesktop]}>
            {/* Sized to portraitCard exactly (nothing else in normal flow
                here) so the glow and both floating badges below can be
                positioned relative to the CARD's real edges instead of
                heroVisual's padding box — anchoring them to the padding
                box is what previously let the badges drift deep into the
                photo/caption instead of mostly floating outside the card. */}
            <View style={styles.heroCardWrap}>
              <View style={styles.heroGlow} />
              <View style={styles.portraitCard}>
                <Image source={{ uri: HERO_IMAGE }} style={styles.portraitImage} resizeMode="cover" />
                <View style={styles.portraitCaption}>
                  <View style={styles.statusDot} />
                  <View style={styles.portraitCaptionText}>
                    <Text style={styles.exampleLabel}>EXAMPLE OPPORTUNITY</Text>
                    <Text style={styles.portraitTitle}>Saturday playdate support</Text>
                    <Text style={styles.portraitSubtitle}>Hillsborough – Vista Park · 10am–12:00pm</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.floatCard, styles.floatCardPay]}>
                <View style={styles.floatCardIconWrap}>
                  <Ionicons name="cash-outline" size={17} color={ACCENT} />
                </View>
                <View>
                  <Text style={styles.floatCardLabel}>You set your rate</Text>
                  <Text style={styles.floatCardValue}>$30–$45+ / hour</Text>
                </View>
              </View>
              <View style={[styles.floatCard, styles.floatCardFit]}>
                <View style={styles.floatCardIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={ACCENT} />
                </View>
                <View>
                  <Text style={styles.floatCardLabel}>A family match</Text>
                  <Text style={styles.floatCardValue}>Based on your experience</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Trust strip */}
        <View style={[styles.trustStrip, isDesktop && styles.trustStripDesktop]}>
          {TRUST_ITEMS.map((item, i) => (
            <View key={item.bold + item.rest} style={styles.trustItemWrap}>
              {i > 0 && isDesktop ? <View style={styles.trustDivider} /> : null}
              <View style={styles.trustItem}>
                <Ionicons name={item.icon} size={26} color={ACCENT} />
                <View>
                  <Text style={styles.trustBold}>{item.bold}</Text>
                  <Text style={styles.trustText}>{item.rest}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Role section — full-bleed white background wrapping a
            capped/centered inner content row, same split used by
            howSection/applySection below: roleSectionDesktop caps its own
            width, so painting the background there would stop it short
            of the viewport edges on wide screens. */}
        <View
          style={styles.roleSectionOuter}
          onLayout={(e) => {
            roleY.current = e.nativeEvent.layout.y;
          }}
        >
        <View style={[styles.roleSection, isDesktop && styles.roleSectionDesktop]}>
          <View style={[styles.roleIntro, isDesktop && styles.roleIntroDesktop]}>
            <Text style={styles.kicker}>A DIFFERENT KIND OF SUPPORT</Text>
            <Text style={styles.roleHeading}>Help children feel at ease.</Text>
            <Text style={styles.roleBody}>
              Opened Circle connects families of neurodivergent children for playdates and matches them with
              providers like you to come along. You’ll help children feel comfortable joining in while parents get
              to know one another.
            </Text>
            <View style={styles.notTherapy}>
              <Ionicons name="shield-checkmark-outline" size={20} color={ACCENT} />
              <Text style={styles.notTherapyText}>
                <Text style={styles.notTherapyBold}>This isn’t a clinical role. </Text>
                You’ll support play and participation—not deliver therapy or follow a treatment plan.
              </Text>
            </View>
          </View>

          <View style={[styles.experienceCard, isDesktop && styles.experienceCardDesktop]}>
            <Text style={styles.cardLabel}>Experience comes in many forms.</Text>
            {EXPERIENCE_ITEMS.map((item) => (
              <View key={item} style={styles.experienceRow}>
                <View style={styles.experienceCheck}>
                  <Ionicons name="checkmark" size={13} color={colors.surface} />
                </View>
                <Text style={styles.experienceText}>{item}</Text>
              </View>
            ))}
            <Text style={styles.experienceNote}>
              Professional training and lived experience both count. We value good judgement, warmth, and a genuine
              connection with kids.
            </Text>
          </View>
        </View>
        </View>

        {/* How it works */}
        <View
          style={styles.howSection}
          onLayout={(e) => {
            howY.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.centerHeading}>
            <Text style={styles.kicker}>HOW IT WORKS</Text>
            <Text style={styles.h2}>Three steps to get started.</Text>
          </View>
          <View style={[styles.stepsGrid, isDesktop && styles.stepsGridDesktop]}>
            {STEPS.map((step, i) => (
              <View key={step.number} style={[styles.stepItemWrap, isDesktop && styles.stepItemWrapDesktop]}>
                {i > 0 && isDesktop ? <View style={styles.stepConnector} /> : null}
                <View style={styles.stepCard}>
                  <View style={styles.stepNumberCircle}>
                    <Text style={styles.stepNumber}>{step.number}</Text>
                  </View>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Apply / interest form */}
        <View
          style={styles.applySection}
          onLayout={(e) => {
            formY.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={[styles.applyInner, isDesktop && styles.applyInnerDesktop]}>
            <View style={[styles.applyCopy, isDesktop && styles.applyCopyDesktop]}>
              <Text style={styles.kickerLight}>FOUNDING PROVIDER NETWORK</Text>
              <Text style={styles.h2Light}>Help us build the village families have been looking for.</Text>
              <Text style={styles.applyBody}>
                Join our first providers in and around Hillsborough and help shape what comes next.
              </Text>
            </View>

            <View style={[styles.leadCard, isDesktop && styles.leadCardDesktop]}>
              {submitted ? (
                <View style={styles.confirmWrap}>
                  <Ionicons name="checkmark-circle" size={32} color={ACCENT} />
                  <Text style={styles.confirmTitle}>You’re on the list.</Text>
                  <Text style={styles.confirmBody}>
                    We’ll send the full application and launch details to {email}.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.formTag}>TAKES ABOUT 1 MINUTE</Text>
                  <Text style={styles.formTitle}>Join the interest list</Text>
                  <Text style={styles.formSubtitle}>We’ll send you the full application and launch details.</Text>

                  <FieldInput label="Full name" placeholder="Your name" value={name} onChangeText={setName} />
                  <FieldInput
                    label="Email"
                    placeholder="you@email.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <FieldInput
                    label="ZIP code"
                    placeholder="94010"
                    value={zip}
                    onChangeText={setZip}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.selectLabel}>Your background</Text>
                  <Pressable style={styles.selectField} onPress={() => setPickerOpen(true)}>
                    <Text style={[styles.selectValue, !background && styles.selectPlaceholder]} numberOfLines={1}>
                      {background ?? 'Select the closest fit'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                  </Pressable>

                  {error ? <Text style={styles.formError}>{error}</Text> : null}

                  <Pressable style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.submitButtonText}>I’m interested</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.surface} />
                  </Pressable>
                  <Text style={styles.privacyNote}>
                    We’ll only use your information to contact you about the provider network.
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.brandRow}>
            <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.footerWordmark}>Opened Circle</Text>
          </View>
          <Text style={styles.footerTagline}>Belonging, shaped differently.</Text>
          <Text style={styles.footerLaunch}>Launching in Hillsborough, California</Text>
          <Pressable onPress={signIn}>
            <Text style={styles.footerSignIn}>
              Already registered? <Text style={styles.footerSignInAccent}>Sign in</Text>
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/')}>
            <Text style={styles.footerFamilyLink}>Looking for a sitter instead? Go to Opened Circle for families</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerScrim} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Your background</Text>
            <ScrollView style={styles.pickerList}>
              {BACKGROUND_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={styles.pickerRow}
                  onPress={() => {
                    setBackground(option);
                    setPickerOpen(false);
                  }}
                >
                  <View style={[styles.radio, background === option && styles.radioSelected]} />
                  <Text style={styles.pickerRowText}>{option}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.textOnDark,
  },
  scroll: {
    flexGrow: 1,
  },

  // Nav
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Matches the reference's own nav-shell background exactly (pulled
    // from its inspector) — without this it fell back to the screen's
    // plain #FAF8F3, one shade off from the hero's #FAF9F3 below it.
    backgroundColor: '#FAF9F3F5',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navDesktop: {
    paddingHorizontal: 48,
    paddingVertical: 22,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 30,
    height: 30,
  },
  brandWordmark: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.heading,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  navLink: {
    fontSize: 15.5,
    fontWeight: '500',
    color: colors.text,
  },
  navCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  navCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
  },

  // Hero
  // Deliberately whiter than the nav above it (colors.surface, not the
  // nav's cream #FAF9F3) — the reference keeps the two visibly distinct
  // rather than blending them.
  hero: {
    backgroundColor: colors.surface,
    // paddingTop (not marginTop) so the nav-to-hero gap is filled with
    // this section's own white background instead of the screen's cream
    // showing through behind it — 12 (original) + 30 (separation from nav).
    paddingTop: 42,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 32,
  },
  // Capped and centered — without this, the row just stretches to fill
  // whatever the viewport is (paddingHorizontal alone doesn't bound it),
  // so on a wide monitor the two capped-width columns end up pinned to
  // opposite edges with excess space between them, and the floating
  // badges' negative offsets can spill past the visible area entirely.
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 48,
    // This overrides hero's own paddingTop entirely in the style merge
    // (it's later in the array) — the 30px nav-separation addition has
    // to be applied here too, not just on the base style, or desktop
    // silently keeps the old spacing regardless of what hero sets.
    paddingTop: 54,
    paddingBottom: 64,
    gap: 56,
  },
  heroCopy: {
    gap: 4,
  },
  // 690 matches the reference h1's own max-width — heroVisualDesktop is a
  // fixed 380, so this still fits inside the 1280 row cap with the 56 gap
  // and 48px side padding to spare.
  heroCopyDesktop: {
    flex: 1,
    maxWidth: 690,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  // Pulled directly from the reference's own inspector: a system sans
  // stack (not this page's usual Geist), a specific green, and uppercase
  // with a bit of tracking — rather than an already-caps source string.
  eyebrowText: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 12,
    fontWeight: '700',
    color: '#1B6B56',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // Matches the reference's actual h1 rule set (pulled from its own
  // devtools Styles pane): Georgia/Times New Roman serif rather than
  // Lora, a much larger clamp(58px,7vw,92px) size, 0.95 line-height, and
  // -0.045em letter-spacing — approximated here as fixed mobile/desktop
  // sizes since RN's fontSize can't take a CSS clamp() expression.
  headline: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: '500',
    fontSize: 58,
    color: '#24382F',
    lineHeight: 55,
    letterSpacing: -2.61,
    marginBottom: 24,
  },
  headlineDesktop: {
    fontSize: 88,
    lineHeight: 84,
    letterSpacing: -3.96,
  },
  // h1 em in the reference: font-style normal (not the browser default
  // italic), a specific green, and a lighter 500 weight than the rest of
  // the bold headline.
  // Exact em color from the reference's own inspector (#1B6B56) — very
  // close to this page's ACCENT but measured directly off the em itself
  // rather than estimated.
  headlineAccent: {
    color: '#1B6B56',
    fontStyle: 'normal',
    fontWeight: '500',
  },
  lede: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 24,
    maxWidth: 440,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15.5,
    fontWeight: '700',
  },
  // A detached border-bottom rather than text-decoration:underline — the
  // reference shows a clean line with a gap beneath the text, not one
  // sitting tight against the descenders.
  secondaryLinkWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.textMuted,
    paddingBottom: 4,
  },
  secondaryLink: {
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
  },

  // Hero visual
  heroVisual: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  // A fixed width (not flex + maxWidth) — flex:1 let this column grow to
  // fill whatever space heroCopy didn't claim, which on a wide viewport
  // meant a much wider card than intended and, since portraitImage's
  // height is tied to its width via aspectRatio, a much taller photo too.
  heroVisualDesktop: {
    width: 380,
  },
  // Wraps just the card (nothing else sits in normal flow here), so it's
  // sized to exactly the card's box — the glow and both floating badges
  // below are positioned against THIS, not heroVisual's padding box, so
  // their offsets describe distance from the card's real edges.
  heroCardWrap: {
    position: 'relative',
  },
  portraitCard: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    // Insets the photo on 3 sides so a white frame shows around it,
    // matching the reference — the caption row below intentionally
    // ignores this (own padding instead) so its text still runs the
    // full card width.
    paddingTop: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  // A soft ambient shape behind the card, peeking out past its edges —
  // approximates the reference's blurred background glow (React Native
  // has no cheap true gaussian blur, so this is a large, low-opacity
  // solid circle instead). Offsets are relative to heroCardWrap, i.e. the
  // card's own box, so this scales with the card instead of drifting.
  heroGlow: {
    position: 'absolute',
    top: -40,
    left: -56,
    right: -56,
    bottom: -40,
    backgroundColor: ACCENT_MUTED,
    opacity: 0.55,
    borderRadius: 999,
  },
  // A fixed height made this look landscape on wide desktop columns
  // (this container can grow up to 440px wide) — aspectRatio keeps it a
  // taller portrait crop, matching the reference, at any width. Rounded
  // on its own now that it's inset inside the card's padding rather than
  // flush with (and clipped by) the card's own corners.
  portraitImage: {
    width: '100%',
    aspectRatio: 1.05,
    borderRadius: 16,
  },
  portraitCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  portraitCaptionText: {
    flex: 1,
  },
  exampleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.caption,
    letterSpacing: 1,
    marginBottom: 2,
  },
  portraitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.heading,
  },
  portraitSubtitle: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  floatCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    maxWidth: 230,
  },
  floatCardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: ACCENT_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Offsets are relative to heroCardWrap (the card's own box): a badge
  // roughly 54px tall sitting at top:-36 has ~18px overlapping down into
  // the card (fine — that lands on the photo, not text) while most of it
  // floats above and to the left, outside the card entirely.
  floatCardPay: {
    top: -36,
    left: -28,
  },
  // Mirrors floatCardPay from the bottom-right corner. bottom:-44 keeps
  // the overlap into the card to ~10px — inside portraitCaption's 18px
  // bottom padding, short of the address line above it — so the badge
  // hangs mostly below the card instead of covering that text.
  floatCardFit: {
    bottom: -44,
    right: -24,
  },
  floatCardLabel: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  floatCardValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.heading,
  },

  // Trust strip
  trustStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  trustStripDesktop: {
    paddingHorizontal: 48,
    justifyContent: 'center',
    gap: 48,
  },
  trustItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginRight: 48,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trustText: {
    fontSize: 13.5,
    color: colors.textMuted,
  },
  // The bold word and its subtext render as two separate lines (icon,
  // then a stacked label + caption) instead of one wrapped sentence.
  trustBold: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  // Role section
  roleSectionOuter: {
    backgroundColor: colors.surface,
  },
  roleSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    gap: 32,
  },
  roleSectionDesktop: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 48,
    paddingVertical: 72,
    gap: 56,
  },
  roleIntro: {
    gap: 4,
  },
  roleIntroDesktop: {
    flex: 1,
    maxWidth: 480,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  h2: {
    fontFamily: 'Lora_700Bold',
    fontSize: 34,
    color: colors.heading,
    lineHeight: 40,
    marginBottom: 14,
  },
  body: {
    fontSize: 15.5,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: 20,
  },
  // Distinct from h2/body above (which "Three steps to get started"
  // still uses) — pulled from the reference's own inspector for this
  // specific heading/paragraph pair.
  // fontWeight was a guess (700) made without real data and came out
  // visibly too heavy against the reference, which renders this at
  // normal weight — the serif face alone gives it enough presence.
  roleHeading: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: '400',
    fontSize: 48,
    color: '#24382F',
    lineHeight: 46,
    letterSpacing: -2.16,
    marginTop: 17,
    marginBottom: 22,
  },
  roleBody: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 17,
    color: '#61756B',
    lineHeight: 27,
    marginBottom: 20,
  },
  notTherapy: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EDF5EF',
    borderRadius: 16,
    marginTop: 22,
    padding: 18,
  },
  notTherapyText: {
    flex: 1,
    fontSize: 13.5,
    color: colors.text,
    lineHeight: 20,
  },
  notTherapyBold: {
    fontWeight: '700',
  },
  experienceCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 4,
  },
  experienceCardDesktop: {
    flex: 1,
    maxWidth: 440,
  },
  cardLabel: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontWeight: '700',
    fontSize: 16,
    color: '#394F44',
    marginBottom: 23,
  },
  experienceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  experienceCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  experienceText: {
    flex: 1,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 14,
    color: '#53675E',
    lineHeight: 20,
  },
  // marginTop combines the reference's own 20px margin + 16px padding
  // above this paragraph (no border/bg here to make the two visually
  // distinct, so one combined value reads the same).
  experienceNote: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 12,
    color: '#61756B',
    lineHeight: 19,
    marginTop: 36,
  },

  // How it works
  howSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    backgroundColor: '#EEF4EF',
  },
  centerHeading: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepsGrid: {
    gap: 28,
  },
  stepsGridDesktop: {
    flexDirection: 'row',
    maxWidth: 960,
    alignSelf: 'center',
    gap: 0,
  },
  stepItemWrap: {
    flex: 1,
  },
  stepItemWrapDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // A dashed line bridging one step's number circle to the next — sits
  // as a row-sibling before the card, offset down to roughly the
  // circle's vertical center (28px radius + card's own top padding).
  stepConnector: {
    width: 28,
    marginTop: 26,
    marginRight: -8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.textMuted,
  },
  stepCard: {
    flex: 1,
    padding: 12,
  },
  stepNumberCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  // Georgia (not Lora) at normal weight — matches how this site's other
  // serif headings turned out to actually be styled once checked against
  // the reference directly, rather than the bold Lora guess made before
  // any of that was confirmed.
  stepNumber: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: '400',
    fontSize: 17,
    color: ACCENT,
  },
  // fontWeight was another unverified guess that came out too heavy —
  // the reference renders these at normal weight.
  stepTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.heading,
    marginBottom: 8,
  },
  stepBody: {
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 20,
  },

  // Apply section
  // Full-bleed dark background — stays uncapped so the color reaches the
  // screen edges; applyInner below is what actually gets width-capped
  // and centered, same split as howSection/stepsGrid already uses.
  applySection: {
    backgroundColor: colors.heading,
  },
  applyInner: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    gap: 32,
  },
  applyInnerDesktop: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 48,
    paddingVertical: 72,
    gap: 56,
    alignItems: 'center',
  },
  applyCopy: {
    gap: 4,
  },
  applyCopyDesktop: {
    flex: 1,
    maxWidth: 420,
  },
  kickerLight: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT_MUTED,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  h2Light: {
    fontFamily: 'Lora_700Bold',
    fontSize: 32,
    color: colors.textOnDark,
    lineHeight: 38,
    marginBottom: 14,
  },
  applyBody: {
    fontSize: 15,
    color: 'rgba(250, 248, 243, 0.75)',
    lineHeight: 23,
  },
  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
  },
  leadCardDesktop: {
    flex: 1,
    maxWidth: 440,
  },
  formTag: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 1,
    marginBottom: 8,
  },
  formTitle: {
    fontFamily: 'Lora_700Bold',
    fontSize: 24,
    color: colors.heading,
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: 13.5,
    color: colors.textMuted,
    marginBottom: 20,
    lineHeight: 19,
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 8,
  },
  selectValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  selectPlaceholder: {
    color: colors.textMuted,
  },
  formError: {
    fontSize: 12.5,
    color: colors.error,
    marginBottom: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 15,
    marginTop: 4,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  privacyNote: {
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
  confirmWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  confirmTitle: {
    fontFamily: 'Lora_700Bold',
    fontSize: 22,
    color: colors.heading,
  },
  confirmBody: {
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    gap: 6,
  },
  footerWordmark: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.heading,
  },
  footerTagline: {
    fontSize: 13.5,
    color: colors.textMuted,
    marginTop: 8,
  },
  footerLaunch: {
    fontSize: 12,
    color: colors.caption,
    marginBottom: 12,
  },
  footerSignIn: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 8,
  },
  footerSignInAccent: {
    color: ACCENT,
    fontWeight: '700',
  },
  footerFamilyLink: {
    fontSize: 11.5,
    color: colors.caption,
    marginTop: 6,
  },

  // Background picker modal
  pickerScrim: {
    flex: 1,
    backgroundColor: 'rgba(18, 61, 59, 0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.heading,
    marginBottom: 12,
  },
  pickerList: {
    maxHeight: 420,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 1,
  },
  radioSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  pickerRowText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
