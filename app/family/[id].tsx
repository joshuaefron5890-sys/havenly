import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { FamilyProfile, fetchFamilyProfile } from '../../lib/families';
import { colors } from '../../theme/colors';

export default function FamilyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<FamilyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local-only for now — there's no real favorites/connections system yet,
  // so this doesn't persist anywhere.
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchFamilyProfile(id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const proposePlaydate = () => {
    Alert.alert('Coming soon', 'Proposing playdates isn’t available yet.');
  };

  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <EmptyState text={`Couldn’t load this family (${error}).`} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const familyName = profile.lastName ? `The ${profile.lastName} Family` : profile.firstName || 'This family';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Photo
            source={profile.familyPhotoUrl ? { uri: profile.familyPhotoUrl } : undefined}
            style={styles.heroImage}
          />
          <View style={styles.heroScrim} />
          <View style={styles.heroTopRow}>
            <Pressable style={styles.back} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Pressable style={styles.heartButton} onPress={() => setFavorited((f) => !f)}>
              <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={20} color={colors.surface} />
            </Pressable>
          </View>
          <View style={styles.heroBottomRow}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {familyName}
            </Text>
            <View style={styles.matchBadge}>
              <Text style={styles.matchScore}>{profile.matchScore}</Text>
              <Text style={styles.matchLabel}>match</Text>
            </View>
          </View>
        </View>

        {profile.sharedNeurodivergence.length > 0 && (
          <View style={styles.sharedExperienceRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={styles.sharedExperienceText}>
              Shared experience with {profile.sharedNeurodivergence.join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SHARED INTERESTS</Text>
          {profile.sharedInterests.length > 0 ? (
            <View style={styles.tags}>
              {profile.sharedInterests.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyInline}>No shared interests yet.</Text>
          )}

          {profile.theirUniqueInterests.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.cardLabel}>{(profile.firstName || 'Their').toUpperCase()}'S INTERESTS</Text>
              <View style={styles.tags}>
                {profile.theirUniqueInterests.map((tag) => (
                  <View key={tag} style={[styles.tag, styles.tagMuted]}>
                    <Text style={[styles.tagText, styles.tagTextMuted]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>PLAY STYLE & AVAILABILITY</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Play style</Text>
            <Text style={styles.infoValue}>{profile.theirPlayStyle.join(' · ') || 'Not shared yet'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Best times</Text>
            <Text style={styles.infoValue}>{profile.availability.join(' · ') || 'Not shared yet'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Navigating</Text>
            <Text style={styles.infoValue}>{profile.theirNeurodivergence.join(' · ') || 'Not shared yet'}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.heartOutlineButton} onPress={() => setFavorited((f) => !f)}>
          <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={20} color={colors.accent} />
        </Pressable>
        <Pressable style={styles.cta} onPress={proposePlaydate}>
          <Text style={styles.ctaText}>Propose a playdate</Text>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  backAlone: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
  },
  hero: {
    height: 220,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Darkens the photo so the white name/badge/icons stay legible regardless
  // of how bright the underlying photo is.
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.surface,
    marginRight: 12,
  },
  matchBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchScore: {
    // A serif accent (Georgia, near-universal, so no webfont to bundle) —
    // deliberately breaks from the app's usual sans-serif for a bit of
    // editorial personality on the one big number on this screen.
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
  },
  matchLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  sharedExperienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sharedExperienceText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
    marginBottom: 10,
  },
  emptyInline: {
    fontSize: 13,
    color: colors.textMuted,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  tagMuted: {
    backgroundColor: colors.border,
  },
  tagTextMuted: {
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  infoRow: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
  },
  heartOutlineButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
