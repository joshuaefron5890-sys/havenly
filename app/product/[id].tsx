import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { addFavoriteProduct, getFavoriteProductUrls, removeFavoriteProduct } from '../../lib/favorites';
import { colors } from '../../theme/colors';

// Product data comes from the retailers' own public search feeds and is
// already fully fetched client-side on the dashboard, so it's handed over
// via route params instead of being re-fetched here — there's no "look up a
// product by id" endpoint, and nothing here is sensitive. The product's own
// url (not the route's [id], which is just an encoded copy) is the
// favorite key, matching what getRecommendedProducts uses server-side.
export default function ProductDetail() {
  const { title, vendor, source, imageUrl, url, description, matchedTags } = useLocalSearchParams<{
    id: string;
    title?: string;
    vendor?: string;
    source?: string;
    imageUrl?: string;
    url: string;
    description?: string;
    matchedTags?: string;
  }>();
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (!url || !user) return;
    let cancelled = false;
    getFavoriteProductUrls(user.uid).then((urls) => {
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
      await (next ? addFavoriteProduct(url) : removeFavoriteProduct(url));
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
        <View style={styles.hero}>
          <Photo source={imageUrl ? { uri: imageUrl } : undefined} style={styles.heroImage} />
          <View style={styles.heroTopRow}>
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
        </View>

        <Text style={styles.title}>{title || 'Product'}</Text>
        {(vendor || source) ? (
          <Text style={styles.vendor}>{[vendor, source].filter(Boolean).join(' · ')}</Text>
        ) : null}

        {description ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DESCRIPTION</Text>
            <Text style={styles.description}>{description}</Text>
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
          <Text style={styles.ctaText}>View product</Text>
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  vendor: {
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
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
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
