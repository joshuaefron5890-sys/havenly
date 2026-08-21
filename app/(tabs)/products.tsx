import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContributeModal } from '../../components/ContributeModal';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { Contribution, CONTRIBUTION_SCHEMAS, createContribution, fetchContributions } from '../../lib/contributions';
import {
  addFavoriteContribution,
  addFavoriteProduct,
  getFavoriteContributionIds,
  getFavoriteProductUrls,
  removeFavoriteContribution,
  removeFavoriteProduct,
} from '../../lib/favorites';
import { fetchRecommendedProducts, productSubtitle, RecommendedProduct } from '../../lib/products';
import { colors } from '../../theme/colors';

const ALL = 'All';
const SCHEMA = CONTRIBUTION_SCHEMAS.product;
const PAGE_BATCH = 12;

function sortFavoritedFirst<T>(items: T[], favoriteIds: Set<string>, keyOf: (item: T) => string): T[] {
  const favorited: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (favoriteIds.has(keyOf(item)) ? favorited : rest).push(item);
  }
  return [...favorited, ...rest];
}

export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState<RecommendedProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(ALL);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributeVisible, setContributeVisible] = useState(false);
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());
  // The server already returns the full deduped/ranked list (see
  // getRecommendedProducts) — this just reveals more of what's already
  // been fetched as the user scrolls, rather than a real paginated fetch.
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchRecommendedProducts()
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoriteProductUrls(user.uid).then((urls) => {
        if (!cancelled) setFavoriteUrls(new Set(urls));
      });
      getFavoriteContributionIds(user.uid).then((ids) => {
        if (!cancelled) setFavoriteContributionIds(new Set(ids));
      });
      fetchContributions('product').then((result) => {
        if (!cancelled) setContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const sorted = products ? sortFavoritedFirst(products, favoriteUrls, (p) => p.url) : null;

  // Tag options are derived from whatever actually came back, not a fixed
  // list — matches whichever of the child's neurodivergence tags actually
  // turned up real products.
  const tagOptions = useMemo(() => {
    if (!sorted) return [ALL];
    const tags = new Set<string>();
    sorted.forEach((p) => p.matchedTags.forEach((t) => tags.add(t)));
    return [ALL, ...[...tags].sort()];
  }, [sorted]);

  const filtered = useMemo(() => {
    if (!sorted) return null;
    const q = query.trim().toLowerCase();
    return sorted.filter((p) => {
      if (tagFilter !== ALL && !p.matchedTags.includes(tagFilter)) return false;
      if (q && !p.title.toLowerCase().includes(q) && !p.vendor.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, query, tagFilter]);

  // Favorited products always show in full, ahead of community picks —
  // only the remaining (unfavorited) curated recommendations are the ones
  // paginated by scroll, since that's the potentially-long tail.
  const favoritedProducts = filtered?.filter((p) => favoriteUrls.has(p.url)) ?? null;
  const restProducts = filtered?.filter((p) => !favoriteUrls.has(p.url)) ?? null;
  const visibleRestProducts = restProducts?.slice(0, visibleCount);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom < 400) {
      setVisibleCount((prev) => Math.min(prev + PAGE_BATCH, restProducts?.length ?? prev));
    }
  };

  // Community contributions aren't tagged, so they're exempt from the tag
  // filter and only narrowed by the search text.
  const filteredContributions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contributions;
    return contributions.filter((c) => (c.fields.title ?? '').toLowerCase().includes(q));
  }, [contributions, query]);

  const toggleFavorite = async (product: RecommendedProduct) => {
    const wasFavorited = favoriteUrls.has(product.url);
    setFavoriteUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(product.url) : next.add(product.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteProduct(product.url) : addFavoriteProduct(product.url));
    } catch {
      setFavoriteUrls((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(product.url) : next.delete(product.url);
        return next;
      });
    }
  };

  const toggleContributionFavorite = async (contributionId: string) => {
    const wasFavorited = favoriteContributionIds.has(contributionId);
    setFavoriteContributionIds((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(contributionId) : next.add(contributionId);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteContribution(contributionId) : addFavoriteContribution(contributionId));
    } catch {
      setFavoriteContributionIds((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(contributionId) : next.delete(contributionId);
        return next;
      });
    }
  };

  const submitContribution = async (name: string, values: Record<string, string>) => {
    await createContribution('product', values, name);
    const result = await fetchContributions('product');
    setContributions(result);
  };

  // Community contributions must render regardless of the recommended-
  // products fetch's own state — this used to live inside that fetch's
  // error/loading branch, so a contributor's own just-submitted product
  // would silently vanish behind "Couldn't load products" whenever that
  // unrelated feed had trouble.
  const hasContent = (filtered?.length ?? 0) > 0 || filteredContributions.length > 0;
  const doneLoadingProducts = sorted !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={200}>
        <SectionHero
          imageUrl="https://plus.unsplash.com/premium_photo-1701984402122-0df5fd84ac53?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Products for your child"
          description="Shop for items that may fit your child's needs or recommend products to others that worked well for you."
        />
        <Pressable style={styles.contributeButton} onPress={() => setContributeVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute a product</Text>
        </Pressable>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search products" />
        {tagOptions.length > 2 ? <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} /> : null}

        {error ? <EmptyState text={`Couldn’t load recommended products (${error}). Community picks still show below.`} /> : null}
        {sorted === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <View style={styles.grid}>
            {favoritedProducts?.map((product) => (
              <SquareCard
                key={product.url}
                title={product.title}
                subtitle={productSubtitle(product)}
                image={product.imageUrl ? { uri: product.imageUrl } : undefined}
                favorited={favoriteUrls.has(product.url)}
                onToggleFavorite={() => toggleFavorite(product)}
                onPress={() =>
                  router.push({
                    pathname: '/product/[id]',
                    params: {
                      id: encodeURIComponent(product.url),
                      title: product.title,
                      vendor: product.vendor,
                      source: product.source,
                      imageUrl: product.imageUrl ?? '',
                      url: product.url,
                      description: product.description,
                      matchedTags: product.matchedTags.join(','),
                    },
                  })
                }
              />
            ))}
            {filteredContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                image={c.fields.imageUrl ? { uri: c.fields.imageUrl } : undefined}
                icon={c.fields.imageUrl ? undefined : 'bag-outline'}
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={() => toggleContributionFavorite(c.id)}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'product', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
                  })
                }
              />
            ))}
            {visibleRestProducts?.map((product) => (
              <SquareCard
                key={product.url}
                title={product.title}
                subtitle={productSubtitle(product)}
                image={product.imageUrl ? { uri: product.imageUrl } : undefined}
                favorited={favoriteUrls.has(product.url)}
                onToggleFavorite={() => toggleFavorite(product)}
                onPress={() =>
                  router.push({
                    pathname: '/product/[id]',
                    params: {
                      id: encodeURIComponent(product.url),
                      title: product.title,
                      vendor: product.vendor,
                      source: product.source,
                      imageUrl: product.imageUrl ?? '',
                      url: product.url,
                      description: product.description,
                      matchedTags: product.matchedTags.join(','),
                    },
                  })
                }
              />
            ))}
          </View>
        ) : doneLoadingProducts ? (
          <EmptyState text="No products match that search." />
        ) : null}
        {(visibleRestProducts?.length ?? 0) < (restProducts?.length ?? 0) ? (
          <ActivityIndicator color={colors.accent} style={styles.loadingMore} />
        ) : null}
      </ScrollView>

      <ContributeModal
        visible={contributeVisible}
        title={`Contribute a ${SCHEMA.noun}`}
        fields={SCHEMA.fields}
        defaultName={user?.displayName ?? ''}
        onClose={() => setContributeVisible(false)}
        onSubmit={submitContribution}
      />
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spinner: {
    marginVertical: 12,
  },
  loadingMore: {
    marginTop: 16,
  },
  contributeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    marginBottom: 16,
  },
  contributeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
});
