import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

export default function HelperDetail() {
  const isDesktop = useIsDesktop();
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.desktopColumn]}>
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          <Photo source={images.helperMarcus} style={styles.heroImage} />
          <Pressable style={styles.back} onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Marcus T.</Text>
        <Text style={styles.subtitle}>BCBA · 7 years experience · 0.6 mi</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>$45/hr</Text>
            <Text style={styles.statLabel}>Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>4.9 ★</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>38</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SPECIALTY</Text>
          <Text style={styles.cardText}>Behavioral support · ADHD · Autism</Text>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>Behavioral Support</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>Sitter</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>AVAILABILITY</Text>
          <Text style={styles.cardText}>Sat & Sun mornings · Wed evenings</Text>
        </View>

        <View style={styles.trustBanner}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
          <Text style={styles.trustText}>
            <Text style={styles.trustBold}>Vetted by Opened Circle. </Text>
            Background checked, credential-verified, and matched to ND families.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, isDesktop && styles.desktopColumn]}>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Request for a playdate</Text>
        </Pressable>
        <Pressable style={styles.secondaryCta}>
          <Text style={styles.secondaryCtaText}>Book a standalone session</Text>
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
  },
  // This is a focused detail screen, not a nav-anchored page — no sidebar
  // makes sense here, so "desktop-friendly" just means a comfortably wide
  // centered reading column instead of stretching edge to edge.
  desktopColumn: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  hero: {
    height: 200,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    overflow: 'hidden',
  },
  heroDesktop: {
    height: 340,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  titleDesktop: {
    fontSize: 30,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 15,
    color: colors.text,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.accentMuted,
    borderRadius: 14,
    padding: 14,
  },
  trustText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  trustBold: {
    fontWeight: '700',
  },
  footer: {
    padding: 20,
    gap: 10,
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
  secondaryCta: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryCtaText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
