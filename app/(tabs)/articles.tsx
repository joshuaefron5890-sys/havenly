import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { useAuth } from '../../contexts/AuthContext';
import { addFavoriteResource, getFavoriteResourceUrls, removeFavoriteResource } from '../../lib/favorites';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
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

export default function Articles() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<HealthResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(ALL);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchHealthResources()
      .then((result) => {
        if (!cancelled) setArticles(result);
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
      getFavoriteResourceUrls(user.uid).then((urls) => {
        if (!cancelled) setFavoriteUrls(new Set(urls));
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const sorted = articles ? sortFavoritedFirst(articles, favoriteUrls, (a) => a.url) : null;

  const tagOptions = useMemo(() => {
    if (!sorted) return [ALL];
    const tags = new Set<string>();
    sorted.forEach((a) => a.matchedTags.forEach((t) => tags.add(t)));
    return [ALL, ...[...tags].sort()];
  }, [sorted]);

  const filtered = useMemo(() => {
    if (!sorted) return null;
    const q = query.trim().toLowerCase();
    return sorted.filter((a) => {
      if (tagFilter !== ALL && !a.matchedTags.includes(tagFilter)) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, query, tagFilter]);

  const toggleFavorite = async (article: HealthResource) => {
    const wasFavorited = favoriteUrls.has(article.url);
    setFavoriteUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(article.url) : next.add(article.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteResource(article.url) : addFavoriteResource(article.url));
    } catch {
      setFavoriteUrls((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(article.url) : next.delete(article.url);
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Articles." />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          photoSeed="havenly-articles"
          title="Vetted guides & articles"
          description="Health and parenting information from MedlinePlus, matched to your child's neurodivergence tags."
        />
        {error ? (
          <EmptyState text={`Couldn’t load articles (${error}).`} />
        ) : sorted === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : sorted.length === 0 ? (
          <EmptyState text="No articles yet." />
        ) : (
          <>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search articles" />
            {tagOptions.length > 2 ? (
              <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} />
            ) : null}
            {filtered && filtered.length === 0 ? (
              <EmptyState text="No articles match that search." />
            ) : (
              filtered?.map((article) => (
                <ListRow
                  key={article.url}
                  title={article.title}
                  subtitle={resourceSubtitle(article)}
                  icon="document-text-outline"
                  favorited={favoriteUrls.has(article.url)}
                  onToggleFavorite={() => toggleFavorite(article)}
                  onPress={() =>
                    router.push({
                      pathname: '/article/[id]',
                      params: {
                        id: encodeURIComponent(article.url),
                        title: article.title,
                        summary: article.summary,
                        url: article.url,
                        matchedTags: article.matchedTags.join(','),
                      },
                    })
                  }
                />
              ))
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
});
