import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlogIcon } from '../../components/BlogIcon';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { addFavoriteResource, getFavoriteResourceUrls, removeFavoriteResource } from '../../lib/favorites';
import { colors } from '../../theme/colors';

// Article data comes from MedlinePlus's public search API (or, for a blog
// post, functions/index.js's getBlogFeed) and is already fully fetched
// client-side on the dashboard, so it's handed over via route params
// instead of being re-fetched here — there's no "look up an article by id"
// endpoint, and nothing here is sensitive. The item's own url (not the
// route's [id], which is just an encoded copy) is the favorite key,
// matching what both server functions use for their own favoriting.
export default function ArticleDetail() {
  const { title, summary, url, matchedTags, source } = useLocalSearchParams<{
    id: string;
    title?: string;
    summary?: string;
    url: string;
    matchedTags?: string;
    // Absent for a MedlinePlus article (matchedTags implies that origin) —
    // present with the blog's name (e.g. "NeuroClastic") for a blog post.
    source?: string;
  }>();
  const attribution = source || 'MedlinePlus';
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (!url || !user) return;
    let cancelled = false;
    getFavoriteResourceUrls(user.uid).then((urls) => {
      if (!cancelled) setFavorited(urls.includes(url));
    });
    return () => {
      cancelled = true;
    };
  }, [url, user]);

  const toggleFavorite = async () => {
    if (!url || favoriteBusy) return;
    setFavoriteBusy(true);
    const next = !favorited;
    setFavorited(next);
    try {
      await (next ? addFavoriteResource(url) : removeFavoriteResource(url));
    } catch {
      setFavorited(!next);
      showAlert('Couldn’t save that', 'Please try again.');
    } finally {
      setFavoriteBusy(false);
    }
  };

  const tags = matchedTags ? matchedTags.split(',').filter(Boolean) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable style={styles.back} onPress={() => router.back()}>
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

        <View style={styles.iconWrap}>
          {source ? (
            <BlogIcon size={28} color={colors.accent} />
          ) : (
            <Ionicons name="document-text-outline" size={28} color={colors.accent} />
          )}
        </View>

        <Text style={styles.title}>{title || 'Article'}</Text>
        <Text style={styles.attribution}>{attribution}</Text>

        {summary ? (
          <View style={styles.card}>
            <Text style={styles.snippet}>{summary}</Text>
          </View>
        ) : null}

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
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={20}
            color={favorited ? colors.accent : colors.textMuted}
          />
        </Pressable>
        <Pressable
          style={[styles.cta, !url && styles.ctaDisabled]}
          disabled={!url}
          onPress={() => url && Linking.openURL(url)}
        >
          <Text style={styles.ctaText}>Read on {attribution}</Text>
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  attribution: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  snippet: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
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
    opacity: 0.5,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
