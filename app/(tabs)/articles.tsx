import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContributeModal } from '../../components/ContributeModal';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { useAuth } from '../../contexts/AuthContext';
import { Contribution, CONTRIBUTION_SCHEMAS, createContribution, fetchContributions } from '../../lib/contributions';
import { addFavoriteResource, getFavoriteResourceUrls, removeFavoriteResource } from '../../lib/favorites';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { colors } from '../../theme/colors';

const ALL = 'All';
const SCHEMA = CONTRIBUTION_SCHEMAS.article;

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
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributeVisible, setContributeVisible] = useState(false);

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
      fetchContributions('article').then((result) => {
        if (!cancelled) setContributions(result);
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

  const filteredContributions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contributions;
    return contributions.filter((c) => (c.fields.title ?? '').toLowerCase().includes(q));
  }, [contributions, query]);

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

  const submitContribution = async (name: string, values: Record<string, string>) => {
    await createContribution('article', values, name);
    const result = await fetchContributions('article');
    setContributions(result);
  };

  // Community contributions must render regardless of the health-resources
  // fetch's own state — this used to live inside that fetch's error/loading
  // branch, so a contributor's own just-submitted article would silently
  // vanish behind "Couldn't load articles" whenever that unrelated feed had
  // trouble.
  const hasContent = (filtered?.length ?? 0) > 0 || filteredContributions.length > 0;
  const doneLoadingArticles = sorted !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          imageUrl="https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Vetted guides & articles"
          description="Health and parenting information from MedlinePlus, matched to your child's neurodivergence tags."
        />
        <Pressable style={styles.contributeButton} onPress={() => setContributeVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute an article</Text>
        </Pressable>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search articles" />
        {tagOptions.length > 2 ? <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} /> : null}

        {error ? <EmptyState text={`Couldn’t load articles (${error}). Community picks still show below.`} /> : null}
        {sorted === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <>
            {filteredContributions.map((c) => (
              <ListRow
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                icon="document-text-outline"
                community
                contributedBy={c.contributedByName}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'article', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName },
                  })
                }
              />
            ))}
            {filtered?.map((article) => (
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
            ))}
          </>
        ) : doneLoadingArticles ? (
          <EmptyState text="No articles match that search." />
        ) : null}
      </ScrollView>

      <ContributeModal
        visible={contributeVisible}
        title={`Contribute an ${SCHEMA.noun}`}
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
  spinner: {
    marginVertical: 12,
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
