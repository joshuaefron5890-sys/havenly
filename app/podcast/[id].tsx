import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { addFavoritePodcast, getFavoritePodcastIds, removeFavoritePodcast } from '../../lib/favorites';
import { colors } from '../../theme/colors';

// Podcast data is public (Apple's iTunes Search API) and already fully
// fetched client-side on the dashboard, so it's handed over via route
// params instead of being re-fetched here — there's no "look up a podcast
// by id" endpoint to call, and nothing here is sensitive.
export default function PodcastDetail() {
  const { id, title, artist, artworkUrl, viewUrl, matchedTags } = useLocalSearchParams<{
    id: string;
    title?: string;
    artist?: string;
    artworkUrl?: string;
    viewUrl?: string;
    matchedTags?: string;
  }>();
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    getFavoritePodcastIds(user.uid).then((ids) => {
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
    setFavorited(next);
    try {
      await (next ? addFavoritePodcast(id) : removeFavoritePodcast(id));
    } catch {
      setFavorited(!next);
      Alert.alert('Couldn’t save that', 'Please try again.');
    } finally {
      setFavoriteBusy(false);
    }
  };

  const tags = matchedTags ? matchedTags.split(',').filter(Boolean) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Photo source={artworkUrl ? { uri: artworkUrl } : undefined} style={styles.heroImage} />
          <View style={styles.heroTopRow}>
            <Pressable style={styles.back} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Pressable style={styles.heartButton} onPress={toggleFavorite}>
              <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={20} color={colors.surface} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.title}>{title || 'Untitled podcast'}</Text>
        {artist ? <Text style={styles.artist}>{artist}</Text> : null}

        {tags.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>MATCHES</Text>
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.heartOutlineButton} onPress={toggleFavorite}>
          <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={20} color={colors.accent} />
        </Pressable>
        <Pressable
          style={[styles.cta, !viewUrl && styles.ctaDisabled]}
          disabled={!viewUrl}
          onPress={() => viewUrl && Linking.openURL(viewUrl)}
        >
          <Text style={styles.ctaText}>Listen</Text>
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
  hero: {
    height: 220,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  artist: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 16,
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
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
