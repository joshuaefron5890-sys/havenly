import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { useAuth } from '../../contexts/AuthContext';
import {
  addFavoriteFamily,
  addFavoritePodcast,
  addFavoriteProduct,
  addFavoriteResource,
  getFavoriteFamilyUids,
  getFavoritePodcastIds,
  getFavoriteProductUrls,
  getFavoriteResourceUrls,
  removeFavoriteFamily,
  removeFavoritePodcast,
  removeFavoriteProduct,
  removeFavoriteResource,
} from '../../lib/favorites';
import {
  familyDisplayName,
  familyPhoto,
  familySubtitle,
  fetchFamiliesByUids,
  fetchSuggestedFamilies,
  SuggestedFamily,
} from '../../lib/families';
import { fetchPodcastSuggestions, podcastSubtitle, PodcastSuggestion } from '../../lib/podcasts';
import { fetchRecommendedProducts, productSubtitle, RecommendedProduct } from '../../lib/products';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { colors } from '../../theme/colors';

const PAGE_SIZE = 3;

// Only offers the toggle once there's actually more than PAGE_SIZE to show
// — no "View all" on a list that's already fully visible.
function expandAction(count: number, expanded: boolean, setExpanded: (v: boolean) => void) {
  if (count <= PAGE_SIZE) return {};
  return { action: expanded ? 'Show less' : 'View all', onAction: () => setExpanded(!expanded) };
}

// Favorited items lead each section, everything else follows — the same
// item never appears twice.
function sortFavoritedFirst<T>(items: T[], favoriteIds: Set<string>, keyOf: (item: T) => string): T[] {
  const favorited: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (favoriteIds.has(keyOf(item)) ? favorited : rest).push(item);
  }
  return [...favorited, ...rest];
}

// Favorited families can fall outside the suggested pool (it's capped
// server-side) — merge the two by uid instead of just re-sorting one list,
// so a family you've already favorited never disappears from view.
function mergeFamilies(favorited: SuggestedFamily[], suggested: SuggestedFamily[]): SuggestedFamily[] {
  const byUid = new Map<string, SuggestedFamily>();
  for (const family of favorited) byUid.set(family.uid, family);
  for (const family of suggested) if (!byUid.has(family.uid)) byUid.set(family.uid, family);
  return [...byUid.values()];
}

export default function ForYou() {
  const { user } = useAuth();

  // Families
  const [families, setFamilies] = useState<SuggestedFamily[] | null>(null);
  const [familiesError, setFamiliesError] = useState<string | null>(null);
  const [favoriteFamilies, setFavoriteFamilies] = useState<SuggestedFamily[] | null>(null);
  const [favoriteFamilyUids, setFavoriteFamilyUids] = useState<Set<string>>(new Set());
  const [familiesExpanded, setFamiliesExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchSuggestedFamilies()
      .then((result) => {
        if (!cancelled) setFamilies(result);
      })
      .catch((err: any) => {
        if (!cancelled) setFamiliesError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Re-fetches every time this screen regains focus (not just on mount) —
  // favoriting can also happen on the family detail screen, so coming back
  // here needs to pick up whatever changed there.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoriteFamilyUids(user.uid)
        .then((ids) => {
          if (cancelled) return null;
          setFavoriteFamilyUids(new Set(ids));
          return fetchFamiliesByUids(ids);
        })
        .then((result) => {
          if (!cancelled && result) setFavoriteFamilies(result);
        })
        .catch((err: any) => {
          if (!cancelled) setFamiliesError(err?.message ?? err?.code ?? 'unknown error');
        });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const familiesLoading = families === null || favoriteFamilies === null;
  const mergedFamilies = familiesLoading ? [] : mergeFamilies(favoriteFamilies!, families!);

  const toggleFamilyFavorite = async (family: SuggestedFamily) => {
    const wasFavorited = favoriteFamilyUids.has(family.uid);
    setFavoriteFamilyUids((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(family.uid) : next.add(family.uid);
      return next;
    });
    setFavoriteFamilies((prev) => {
      const list = prev ?? [];
      return wasFavorited ? list.filter((f) => f.uid !== family.uid) : [...list, family];
    });
    try {
      await (wasFavorited ? removeFavoriteFamily(family.uid) : addFavoriteFamily(family.uid));
    } catch {
      setFavoriteFamilyUids((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(family.uid) : next.delete(family.uid);
        return next;
      });
      setFavoriteFamilies((prev) => {
        const list = prev ?? [];
        return wasFavorited ? [...list, family] : list.filter((f) => f.uid !== family.uid);
      });
    }
  };

  // Products
  const [products, setProducts] = useState<RecommendedProduct[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [favoriteProductUrls, setFavoriteProductUrls] = useState<Set<string>>(new Set());
  const [productsExpanded, setProductsExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchRecommendedProducts()
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: any) => {
        if (!cancelled) setProductsError(err?.message ?? err?.code ?? 'unknown error');
      });
    getFavoriteProductUrls(user.uid).then((ids) => {
      if (!cancelled) setFavoriteProductUrls(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedProducts = products ? sortFavoritedFirst(products, favoriteProductUrls, (p) => p.url) : null;

  const toggleProductFavorite = async (product: RecommendedProduct) => {
    const wasFavorited = favoriteProductUrls.has(product.url);
    setFavoriteProductUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(product.url) : next.add(product.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteProduct(product.url) : addFavoriteProduct(product.url));
    } catch {
      setFavoriteProductUrls((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(product.url) : next.delete(product.url);
        return next;
      });
    }
  };

  // Podcasts
  const [podcasts, setPodcasts] = useState<PodcastSuggestion[] | null>(null);
  const [podcastsError, setPodcastsError] = useState<string | null>(null);
  const [favoritePodcastIds, setFavoritePodcastIds] = useState<Set<string>>(new Set());
  const [podcastsExpanded, setPodcastsExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPodcastSuggestions()
      .then((result) => {
        if (!cancelled) setPodcasts(result);
      })
      .catch((err: any) => {
        if (!cancelled) setPodcastsError(err?.message ?? err?.code ?? 'unknown error');
      });
    getFavoritePodcastIds(user.uid).then((ids) => {
      if (!cancelled) setFavoritePodcastIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedPodcasts = podcasts ? sortFavoritedFirst(podcasts, favoritePodcastIds, (p) => p.id) : null;

  const togglePodcastFavorite = async (podcast: PodcastSuggestion) => {
    const wasFavorited = favoritePodcastIds.has(podcast.id);
    setFavoritePodcastIds((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(podcast.id) : next.add(podcast.id);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoritePodcast(podcast.id) : addFavoritePodcast(podcast.id));
    } catch {
      setFavoritePodcastIds((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(podcast.id) : next.delete(podcast.id);
        return next;
      });
    }
  };

  // Articles
  const [articles, setArticles] = useState<HealthResource[] | null>(null);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [favoriteResourceUrls, setFavoriteResourceUrls] = useState<Set<string>>(new Set());
  const [articlesExpanded, setArticlesExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchHealthResources()
      .then((result) => {
        if (!cancelled) setArticles(result);
      })
      .catch((err: any) => {
        if (!cancelled) setArticlesError(err?.message ?? err?.code ?? 'unknown error');
      });
    getFavoriteResourceUrls(user.uid).then((ids) => {
      if (!cancelled) setFavoriteResourceUrls(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedArticles = articles ? sortFavoritedFirst(articles, favoriteResourceUrls, (a) => a.url) : null;

  const toggleArticleFavorite = async (article: HealthResource) => {
    const wasFavorited = favoriteResourceUrls.has(article.url);
    setFavoriteResourceUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(article.url) : next.add(article.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteResource(article.url) : addFavoriteResource(article.url));
    } catch {
      setFavoriteResourceUrls((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(article.url) : next.delete(article.url);
        return next;
      });
    }
  };

  const firstName = user?.displayName?.split(' ')[0];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title={firstName ? `For you, ${firstName}.` : 'For you.'} />

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader
          title="Families"
          {...expandAction(mergedFamilies.length, familiesExpanded, setFamiliesExpanded)}
        />
        {familiesError ? (
          <EmptyState text={`Couldn’t load families (${familiesError}).`} />
        ) : familiesLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : mergedFamilies.length === 0 ? (
          <EmptyState text="No other families onboarded yet — check back soon." />
        ) : (
          (familiesExpanded ? mergedFamilies : mergedFamilies.slice(0, PAGE_SIZE)).map((family) => {
            const photoUrl = familyPhoto(family);
            return (
              <ListRow
                key={family.uid}
                title={familyDisplayName(family)}
                subtitle={familySubtitle(family)}
                image={photoUrl ? { uri: photoUrl } : undefined}
                favorited={favoriteFamilyUids.has(family.uid)}
                onToggleFavorite={() => toggleFamilyFavorite(family)}
                onPress={() => router.push(`/family/${family.uid}`)}
              />
            );
          })
        )}

        <SectionHeader
          title="Products"
          {...expandAction(sortedProducts?.length ?? 0, productsExpanded, setProductsExpanded)}
        />
        {productsError ? (
          <EmptyState text={`Couldn’t load products (${productsError}).`} />
        ) : sortedProducts === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : sortedProducts.length === 0 ? (
          <EmptyState text="Add your child's neurodivergence info to see product picks." />
        ) : (
          (productsExpanded ? sortedProducts : sortedProducts.slice(0, PAGE_SIZE)).map((product) => (
            <ListRow
              key={product.url}
              title={product.title}
              subtitle={productSubtitle(product)}
              image={product.imageUrl ? { uri: product.imageUrl } : undefined}
              favorited={favoriteProductUrls.has(product.url)}
              onToggleFavorite={() => toggleProductFavorite(product)}
              onPress={() => Linking.openURL(product.url)}
            />
          ))
        )}

        <SectionHeader
          title="Podcasts"
          {...expandAction(sortedPodcasts?.length ?? 0, podcastsExpanded, setPodcastsExpanded)}
        />
        {podcastsError ? (
          <EmptyState text={`Couldn’t load podcasts (${podcastsError}).`} />
        ) : sortedPodcasts === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : sortedPodcasts.length === 0 ? (
          <EmptyState text="Add your child's neurodivergence info to see podcast suggestions." />
        ) : (
          (podcastsExpanded ? sortedPodcasts : sortedPodcasts.slice(0, PAGE_SIZE)).map((podcast) => (
            <ListRow
              key={podcast.id}
              title={podcast.title || 'Untitled podcast'}
              subtitle={podcastSubtitle(podcast)}
              image={podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined}
              favorited={favoritePodcastIds.has(podcast.id)}
              onToggleFavorite={() => togglePodcastFavorite(podcast)}
              onPress={podcast.viewUrl ? () => Linking.openURL(podcast.viewUrl!) : undefined}
            />
          ))
        )}

        <SectionHeader
          title="Articles"
          {...expandAction(sortedArticles?.length ?? 0, articlesExpanded, setArticlesExpanded)}
        />
        {articlesError ? (
          <EmptyState text={`Couldn’t load articles (${articlesError}).`} />
        ) : sortedArticles === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : sortedArticles.length === 0 ? (
          <EmptyState text="Add your child's neurodivergence info to see relevant articles." />
        ) : (
          (articlesExpanded ? sortedArticles : sortedArticles.slice(0, PAGE_SIZE)).map((article) => (
            <ListRow
              key={article.url}
              title={article.title}
              subtitle={resourceSubtitle(article)}
              icon="document-text-outline"
              favorited={favoriteResourceUrls.has(article.url)}
              onToggleFavorite={() => toggleArticleFavorite(article)}
              onPress={() => Linking.openURL(article.url)}
            />
          ))
        )}

        <SectionHeader title="Playdates" />
        <EmptyState text="No playdate suggestions yet — check back once you've connected with families." />
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
  },
});
