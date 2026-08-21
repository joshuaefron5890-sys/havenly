import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContributeModal } from '../../components/ContributeModal';
import { BlogIcon } from '../../components/BlogIcon';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ListRow } from '../../components/ListRow';
import { ReferralIcon } from '../../components/ReferralIcon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { useAuth } from '../../contexts/AuthContext';
import {
  Contribution,
  createContribution,
  fetchContributions,
  resourceSubtypeOf,
  RESOURCE_SUBTYPE_SCHEMAS,
  ResourceSubtype,
  validateReferralContact,
} from '../../lib/contributions';
import {
  addFavoriteContribution,
  addFavoriteResource,
  getFavoriteContributionIds,
  getFavoriteResourceUrls,
  removeFavoriteContribution,
  removeFavoriteResource,
} from '../../lib/favorites';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { BlogPost, blogPostSubtitle, fetchBlogFeed } from '../../lib/blogs';
import { colors } from '../../theme/colors';

const ALL = 'All';
const SUBTYPE_ORDER: ResourceSubtype[] = ['article', 'referral', 'blog'];
const SUBTYPE_FILTER_OPTIONS: (ResourceSubtype | typeof ALL)[] = [ALL, ...SUBTYPE_ORDER];

function sortFavoritedFirst<T>(items: T[], favoriteIds: Set<string>, keyOf: (item: T) => string): T[] {
  const favorited: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (favoriteIds.has(keyOf(item)) ? favorited : rest).push(item);
  }
  return [...favorited, ...rest];
}

// Generic filler words plus a few Haven.ly-specific ones common enough
// across titles (child/kids/parenting/guide-type words) to be useless as a
// quick filter — excluded so the derived list below surfaces an actual
// topic ("sleep", "sensory", "meltdown") instead of restating the obvious.
const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'your', 'from', 'this', 'that', 'about', 'into', 'what', 'how', 'are', 'you',
  'can', 'has', 'have', 'will', 'its', 'when', 'why', 'who', 'all', 'not', 'but', 'out', 'use', 'used', 'using',
  'one', 'two', 'more', 'than', 'over', 'under', 'need', 'know', 'make', 'made', 'get', 'gets', 'new', 'guide',
  'tips', 'help', 'helping', 'helps', 'kids', 'kid', 'child', 'children', 'parent', 'parents', 'parenting',
  'family', 'families',
]);

// Surfaces whatever topics are actually common across the titles currently
// on screen — a quicker, content-aware alternative to typing a search term,
// and one that changes with the feed instead of being a fixed list. Each
// word only counts once per title (a title repeating a word shouldn't
// outweigh two different titles that each mention it once), and a word
// needs to show up in at least 2 different titles to surface at all, so a
// single oddly-worded title doesn't produce a one-off, useless chip.
function extractKeywords(titles: string[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const words = new Set((title.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((w) => !KEYWORD_STOPWORDS.has(w)));
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

export default function Articles() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<HealthResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[] | null>(null);
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(ALL);
  const [keywordFilter, setKeywordFilter] = useState(ALL);
  const [subtypeFilter, setSubtypeFilter] = useState<ResourceSubtype | typeof ALL>(ALL);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  // null while the picker is up (or nothing is open); set once a sub-type
  // is chosen, which is what actually opens ContributeModal below.
  const [contributeSubtype, setContributeSubtype] = useState<ResourceSubtype | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [typeFilterVisible, setTypeFilterVisible] = useState(false);
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());

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

  // Best-effort, like the community contributions below — a blog RSS feed
  // being down shouldn't block or show an error for the rest of the
  // screen, it should just quietly show fewer blog posts.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchBlogFeed()
      .then((result) => {
        if (!cancelled) setBlogPosts(result);
      })
      .catch(() => {
        if (!cancelled) setBlogPosts([]);
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
      getFavoriteContributionIds(user.uid).then((ids) => {
        if (!cancelled) setFavoriteContributionIds(new Set(ids));
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

  // Derived from whatever's actually on screen right now (curated articles,
  // blog posts, and community picks alike) rather than a fixed list, so it
  // tracks the real content instead of going stale.
  const keywordOptions = useMemo(() => {
    const titles = [
      ...(sorted ?? []).map((a) => a.title),
      ...(blogPosts ?? []).map((p) => p.title),
      ...contributions.map((c) => c.fields.title ?? ''),
    ];
    const keywords = extractKeywords(titles, 8);
    return keywords.length ? [ALL, ...keywords] : [];
  }, [sorted, blogPosts, contributions]);

  const filtered = useMemo(() => {
    if (!sorted) return null;
    // MedlinePlus results are always plain articles — any other sub-type
    // filter should hide them entirely rather than match nothing per-item.
    if (subtypeFilter !== ALL && subtypeFilter !== 'article') return [];
    const q = query.trim().toLowerCase();
    return sorted.filter((a) => {
      if (tagFilter !== ALL && !a.matchedTags.includes(tagFilter)) return false;
      if (keywordFilter !== ALL && !a.title.toLowerCase().includes(keywordFilter)) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, query, tagFilter, keywordFilter, subtypeFilter]);

  const filteredContributions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contributions.filter((c) => {
      if (subtypeFilter !== ALL && resourceSubtypeOf(c) !== subtypeFilter) return false;
      if (keywordFilter !== ALL && !(c.fields.title ?? '').toLowerCase().includes(keywordFilter)) return false;
      if (q && !(c.fields.title ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contributions, query, keywordFilter, subtypeFilter]);

  const sortedBlogPosts = blogPosts ? sortFavoritedFirst(blogPosts, favoriteUrls, (p) => p.url) : null;

  const filteredBlogPosts = useMemo(() => {
    if (!sortedBlogPosts) return null;
    // Same reasoning as the MedlinePlus gate above, just the other
    // direction — these are always blog posts, so any other sub-type
    // filter hides them entirely.
    if (subtypeFilter !== ALL && subtypeFilter !== 'blog') return [];
    const q = query.trim().toLowerCase();
    return sortedBlogPosts.filter((p) => {
      if (keywordFilter !== ALL && !p.title.toLowerCase().includes(keywordFilter)) return false;
      if (q && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sortedBlogPosts, query, keywordFilter, subtypeFilter]);

  // Shared by MedlinePlus articles and blog posts — both are plain
  // { url } curated content favorited via the same favoriteResourceUrls
  // field, unlike community contributions which use favoriteContributionIds.
  const toggleFavorite = async (item: { url: string }) => {
    const wasFavorited = favoriteUrls.has(item.url);
    setFavoriteUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(item.url) : next.add(item.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteResource(item.url) : addFavoriteResource(item.url));
    } catch {
      setFavoriteUrls((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(item.url) : next.delete(item.url);
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
    // Every Resources contribution is stored as Firestore type 'article' —
    // resourceType (in fields, not its own column) is what actually
    // distinguishes article/referral/blog; see lib/contributions.ts's
    // resourceSubtypeOf.
    await createContribution('article', { ...values, resourceType: contributeSubtype ?? 'article' }, name);
    const result = await fetchContributions('article');
    setContributions(result);
  };

  const chooseSubtype = (subtype: ResourceSubtype) => {
    setPickerVisible(false);
    setContributeSubtype(subtype);
  };

  // Community contributions must render regardless of the health-resources
  // fetch's own state — this used to live inside that fetch's error/loading
  // branch, so a contributor's own just-submitted article would silently
  // vanish behind "Couldn't load articles" whenever that unrelated feed had
  // trouble.
  const hasContent = (filtered?.length ?? 0) > 0 || filteredContributions.length > 0 || (filteredBlogPosts?.length ?? 0) > 0;
  const doneLoadingArticles = sorted !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          imageUrl="https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Helpful Resources"
          description="Browse helpful articles, find professional referrals,  and share your favorite blogs."
        />
        <Pressable style={styles.contributeButton} onPress={() => setPickerVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute a resource</Text>
        </Pressable>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search resources" />
        <Pressable style={styles.typeFilterButton} onPress={() => setTypeFilterVisible(true)}>
          <Text style={styles.typeFilterLabel}>Resource Type</Text>
          <View style={styles.typeFilterValue}>
            <Text style={styles.typeFilterValueText}>
              {subtypeFilter === ALL ? ALL : RESOURCE_SUBTYPE_SCHEMAS[subtypeFilter].label}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
        {tagOptions.length > 2 ? <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} /> : null}
        {keywordOptions.length > 1 ? (
          <>
            <Text style={styles.keywordLabel}>TRENDING TOPICS</Text>
            <FilterChips options={keywordOptions} selected={keywordFilter} onSelect={setKeywordFilter} />
          </>
        ) : null}

        {error ? <EmptyState text={`Couldn’t load articles (${error}). Community picks still show below.`} /> : null}
        {sorted === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <>
            {filteredContributions.map((c) => (
              <ListRow
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                subtitle={resourceSubtypeOf(c) === 'referral' ? c.fields.specialty : undefined}
                icon={RESOURCE_SUBTYPE_SCHEMAS[resourceSubtypeOf(c)].icon}
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={() => toggleContributionFavorite(c.id)}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'article', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
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
            {filteredBlogPosts?.map((post) => (
              <ListRow
                key={post.url}
                title={post.title}
                subtitle={blogPostSubtitle(post)}
                icon="blog"
                favorited={favoriteUrls.has(post.url)}
                onToggleFavorite={() => toggleFavorite(post)}
                onPress={() =>
                  router.push({
                    pathname: '/article/[id]',
                    params: {
                      id: encodeURIComponent(post.url),
                      title: post.title,
                      summary: post.snippet,
                      url: post.url,
                      source: post.source,
                    },
                  })
                }
              />
            ))}
          </>
        ) : doneLoadingArticles ? (
          <EmptyState text="No resources match that search." />
        ) : null}
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>What kind of resource?</Text>
            {SUBTYPE_ORDER.map((subtype) => {
              const schema = RESOURCE_SUBTYPE_SCHEMAS[subtype];
              return (
                <Pressable key={subtype} style={styles.pickerOption} onPress={() => chooseSubtype(subtype)}>
                  <View style={styles.pickerIconWrap}>
                    {schema.icon === 'referral' ? (
                      <ReferralIcon size={18} color={colors.accent} />
                    ) : schema.icon === 'blog' ? (
                      <BlogIcon size={18} color={colors.accent} />
                    ) : (
                      <Ionicons name={schema.icon} size={18} color={colors.accent} />
                    )}
                  </View>
                  <Text style={styles.pickerOptionText}>{schema.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={typeFilterVisible} transparent animationType="fade" onRequestClose={() => setTypeFilterVisible(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setTypeFilterVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Resource Type</Text>
            {SUBTYPE_FILTER_OPTIONS.map((option) => {
              const schema = option === ALL ? null : RESOURCE_SUBTYPE_SCHEMAS[option];
              return (
                <Pressable
                  key={option}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSubtypeFilter(option);
                    setTypeFilterVisible(false);
                  }}
                >
                  <View style={styles.pickerIconWrap}>
                    {!schema ? (
                      <Ionicons name="apps-outline" size={18} color={colors.accent} />
                    ) : schema.icon === 'referral' ? (
                      <ReferralIcon size={18} color={colors.accent} />
                    ) : schema.icon === 'blog' ? (
                      <BlogIcon size={18} color={colors.accent} />
                    ) : (
                      <Ionicons name={schema.icon} size={18} color={colors.accent} />
                    )}
                  </View>
                  <Text style={styles.pickerOptionText}>{schema ? schema.label : ALL}</Text>
                  {option === subtypeFilter ? (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <ContributeModal
        visible={contributeSubtype !== null}
        title={`Contribute ${contributeSubtype === 'article' ? 'an' : 'a'} ${RESOURCE_SUBTYPE_SCHEMAS[contributeSubtype ?? 'article'].noun}`}
        fields={RESOURCE_SUBTYPE_SCHEMAS[contributeSubtype ?? 'article'].fields}
        defaultName={user?.displayName ?? ''}
        validate={contributeSubtype === 'referral' ? validateReferralContact : undefined}
        onClose={() => setContributeSubtype(null)}
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
  typeFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  typeFilterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  typeFilterValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeFilterValueText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  keywordLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  pickerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
