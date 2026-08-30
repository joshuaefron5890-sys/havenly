import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { PuzzleMatchIcon } from '../../components/PuzzleMatchIcon';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { addFavoriteFamily, getFavoriteFamilyUids, removeFavoriteFamily } from '../../lib/favorites';
import { familyDisplayName, FamilyProfile, fetchFamilyProfile } from '../../lib/families';
import { getOrCreateConversation } from '../../lib/messages';
import { colors } from '../../theme/colors';

export default function FamilyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, familyUid } = useAuth();
  const [profile, setProfile] = useState<FamilyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);

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

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    getFavoriteFamilyUids(familyUid ?? user.uid).then((ids) => {
      if (!cancelled) setFavorited(ids.includes(id));
    });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const toggleFavorite = async () => {
    if (!id || favoriteBusy) return;
    setFavoriteBusy(true);
    const next = !favorited;
    setFavorited(next); // optimistic — feels instant, reverted below on failure
    try {
      await (next ? addFavoriteFamily(id) : removeFavoriteFamily(id));
    } catch {
      setFavorited(!next);
      showAlert('Couldn’t save that', 'Please try again.');
    } finally {
      setFavoriteBusy(false);
    }
  };

  const openMessageThread = async () => {
    if (!id || messageBusy) return;
    setMessageBusy(true);
    try {
      const conversationId = await getOrCreateConversation(id);
      router.push(`/messages/${conversationId}`);
    } catch {
      showAlert('Couldn’t start that conversation', 'Please try again.');
    } finally {
      setMessageBusy(false);
    }
  };

  const proposePlaydate = () => {
    if (!id) return;
    router.push(`/propose-playdate?familyId=${id}`);
  };

  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => goBack()}>
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

  const familyName = familyDisplayName(profile);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Photo
            source={profile.familyPhotoUrl ? { uri: profile.familyPhotoUrl } : undefined}
            style={styles.heroImage}
            variant="person"
            iconSize={64}
          />
          <View style={styles.heroScrim} />
          <View style={styles.heroTopRow}>
            <Pressable style={styles.back} onPress={() => goBack()}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Pressable style={styles.heartButton} onPress={toggleFavorite}>
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={20}
                color={favorited ? colors.accent : colors.text}
              />
            </Pressable>
          </View>
          <View style={styles.heroBottomRow}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {familyName}
              </Text>
              {profile.city ? (
                <Text style={styles.heroLocation} numberOfLines={1}>
                  {profile.city}, {profile.state}
                </Text>
              ) : null}
            </View>
            <View style={styles.matchBadge}>
              <PuzzleMatchIcon size={16} color={colors.accent} />
              <Text style={styles.matchLabel}>Strong Match</Text>
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

        {profile.children.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>KIDS</Text>
            {profile.children.map((child, i) => (
              <View key={i} style={styles.kidRow}>
                <Photo
                  source={child.photoUrl ? { uri: child.photoUrl } : undefined}
                  style={styles.kidPhoto}
                  variant="person"
                  iconSize={18}
                />
                <View style={styles.kidInfo}>
                  <Text style={styles.kidName}>{child.name || 'A kid'}</Text>
                  {child.age || child.grade ? (
                    <Text style={styles.kidSub}>{[child.age && `Age ${child.age}`, child.grade].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </View>
              </View>
            ))}
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
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT YOU HAVE IN COMMON</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Play style</Text>
            <Text style={styles.infoValue}>{profile.sharedPlayStyle.join(' · ') || 'No overlap yet'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Times that work for both</Text>
            <Text style={styles.infoValue}>{profile.sharedAvailability.join(' · ') || 'No overlap yet'}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.heartOutlineButton} onPress={toggleFavorite}>
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={20}
            color={favorited ? colors.accent : colors.textMuted}
          />
        </Pressable>
        <Pressable style={[styles.cta, messageBusy && styles.ctaDisabled]} onPress={openMessageThread} disabled={messageBusy}>
          <Text style={styles.ctaText}>{messageBusy ? 'Opening…' : 'Message'}</Text>
        </Pressable>
        <Pressable style={styles.ctaSecondary} onPress={proposePlaydate}>
          <Text style={styles.ctaSecondaryText}>Propose a playdate</Text>
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.surface,
  },
  heroLocation: {
    fontSize: 13,
    color: colors.surface,
    opacity: 0.85,
    marginTop: 2,
  },
  // A qualitative "this fits" indicator rather than a raw score — sized to
  // its content instead of the old fixed circle, since "Family Match" runs
  // wider than a two-digit number ever did.
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  matchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
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
  kidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  kidPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentMuted,
  },
  kidInfo: {
    flex: 1,
  },
  kidName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  kidSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
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
    borderColor: colors.border,
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
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  ctaSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  ctaSecondaryText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
