import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { addFavoriteProduct, getFavoriteProductUrls, removeFavoriteProduct } from '../../lib/favorites';
import { fetchRecommendedProducts, productSubtitle, RecommendedProduct } from '../../lib/products';
import { colors } from '../../theme/colors';

const ALL = 'All';

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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          imageUrl="https://plus.unsplash.com/premium_photo-1701984402122-0df5fd84ac53?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Hand-picked for your family"
          description="Sensory tools, calming aids, and everyday products from specialty retailers, matched to your child's neurodivergence tags."
        />
        {error ? (
          <EmptyState text={`Couldn’t load products (${error}).`} />
        ) : sorted === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : sorted.length === 0 ? (
          <EmptyState text="No product picks yet." />
        ) : (
          <>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search products" />
            {tagOptions.length > 2 ? (
              <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} />
            ) : null}
            {filtered && filtered.length === 0 ? (
              <EmptyState text="No products match that search." />
            ) : (
              <View style={styles.grid}>
                {filtered?.map((product) => (
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
            )}
          </>
        )}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
