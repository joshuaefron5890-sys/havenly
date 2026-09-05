import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlogIcon } from '../../components/BlogIcon';
import { ContributeModal } from '../../components/ContributeModal';
import { EmptyState } from '../../components/EmptyState';
import { ReferralIcon } from '../../components/ReferralIcon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { DESKTOP_CARD_WIDTH, SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { BlogPost, blogPostSubtitle, fetchBlogFeed } from '../../lib/blogs';
import {
  Contribution,
  CONTRIBUTION_SCHEMAS,
  ContributionType,
  createContribution,
  fetchContributions,
  resourceSubtypeOf,
  RESOURCE_SUBTYPE_SCHEMAS,
  ResourceSubtype,
  validateReferralContact,
} from '../../lib/contributions';
import {
  addFavoriteContribution,
  addFavoritePodcast,
  addFavoriteProduct,
  addFavoriteResource,
  getFavoriteContributionIds,
  getFavoritePodcastIds,
  getFavoriteProductUrls,
  getFavoriteResourceUrls,
  removeFavoriteContribution,
  removeFavoritePodcast,
  removeFavoriteProduct,
  removeFavoriteResource,
} from '../../lib/favorites';
import { fetchContributorPhotos } from '../../lib/families';
import { articleKey, blogKey, contributionKey, hideContent, podcastKey, productKey } from '../../lib/moderation';
import { fetchPodcastSuggestions, podcastSubtitle, PodcastSuggestion } from '../../lib/podcasts';
import { fetchRecommendedProducts, productSubtitle, RecommendedProduct } from '../../lib/products';
import { useIsDesktop } from '../../lib/responsive';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

// A single card shape every source (curated products/podcasts/health
// resources/blog posts, plus community contributions of all three types)
// gets mapped into, so one feed/grid renderer can mix them all together —
// the same idea as Home's own FavoriteCard, just for this screen.
type ExploreKind = 'product' | 'podcast' | 'resource';

type ExploreItem = {
  key: string;
  kind: ExploreKind;
  title: string;
  subtitle?: string;
  image?: ImageSourcePropType;
  icon?: keyof typeof Ionicons.glyphMap;
  matchedTags: string[];
  community?: boolean;
  contributedBy?: string;
  contributorPhoto?: string | null;
  favorited: boolean;
  onToggleFavorite: () => void;
  onDelete?: () => void;
  onPress: () => void;
};

const KIND_META: Record<ExploreKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  product: { label: 'Products', icon: 'bag-outline' },
  podcast: { label: 'Podcasts', icon: 'mic-outline' },
  resource: { label: 'Resources', icon: 'document-text-outline' },
};

const TYPE_FILTERS: (ExploreKind | 'all')[] = ['all', 'product', 'podcast', 'resource'];

// The five things "Contribute" can create — the three Resources sub-types
// (see lib/contributions.ts's ResourceSubtype) alongside plain product/
// podcast contributions.
const CONTRIBUTE_OPTIONS: { type: ContributionType; subtype?: ResourceSubtype; label: string; icon: keyof typeof Ionicons.glyphMap | 'referral' | 'blog' }[] = [
  { type: 'product', label: 'Product', icon: 'bag-outline' },
  { type: 'podcast', label: 'Podcast', icon: 'mic-outline' },
  { type: 'article', subtype: 'article', label: 'Article', icon: 'document-text-outline' },
  { type: 'article', subtype: 'referral', label: 'Referral', icon: 'referral' },
  { type: 'article', subtype: 'blog', label: 'Blog', icon: 'blog' },
];

function sortFavoritedFirst<T>(items: T[], isFavorited: (item: T) => boolean): T[] {
  const favorited: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (isFavorited(item) ? favorited : rest).push(item);
  }
  return [...favorited, ...rest];
}

export default function Resources() {
  const { user, familyUid, clusterId } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const isDesktop = useIsDesktop();

  const [products, setProducts] = useState<RecommendedProduct[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [podcasts, setPodcasts] = useState<PodcastSuggestion[] | null>(null);
  const [podcastsError, setPodcastsError] = useState<string | null>(null);
  const [articles, setArticles] = useState<HealthResource[] | null>(null);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[] | null>(null);

  const [favoriteProductUrls, setFavoriteProductUrls] = useState<Set<string>>(new Set());
  const [favoritePodcastIds, setFavoritePodcastIds] = useState<Set<string>>(new Set());
  const [favoriteResourceUrls, setFavoriteResourceUrls] = useState<Set<string>>(new Set());
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());

  const [productContributions, setProductContributions] = useState<Contribution[]>([]);
  const [podcastContributions, setPodcastContributions] = useState<Contribution[]>([]);
  const [articleContributions, setArticleContributions] = useState<Contribution[]>([]);
  // Only podcast contributions show a contributor photo (matches the old
  // Podcasts tab) — products/resources never fetched this.
  const [contributorPhotos, setContributorPhotos] = useState<Map<string, string | null>>(new Map());

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ExploreKind | 'all'>('all');

  const [pickerVisible, setPickerVisible] = useState(false);
  const [contributeOption, setContributeOption] = useState<(typeof CONTRIBUTE_OPTIONS)[number] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchRecommendedProducts()
      .then((result) => !cancelled && setProducts(result))
      .catch((err: any) => !cancelled && setProductsError(err?.message ?? err?.code ?? 'unknown error'));
    fetchPodcastSuggestions()
      .then((result) => !cancelled && setPodcasts(result))
      .catch((err: any) => !cancelled && setPodcastsError(err?.message ?? err?.code ?? 'unknown error'));
    fetchHealthResources()
      .then((result) => !cancelled && setArticles(result))
      .catch((err: any) => !cancelled && setArticlesError(err?.message ?? err?.code ?? 'unknown error'));
    // Best-effort, like the community contributions below — a blog RSS feed
    // being down shouldn't block or show an error for the rest of the
    // screen, it should just quietly show fewer blog posts.
    fetchBlogFeed()
      .then((result) => !cancelled && setBlogPosts(result))
      .catch(() => !cancelled && setBlogPosts([]));
    return () => {
      cancelled = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      const uid = familyUid ?? user.uid;
      getFavoriteProductUrls(uid).then((urls) => !cancelled && setFavoriteProductUrls(new Set(urls)));
      getFavoritePodcastIds(uid).then((ids) => !cancelled && setFavoritePodcastIds(new Set(ids)));
      getFavoriteResourceUrls(uid).then((urls) => !cancelled && setFavoriteResourceUrls(new Set(urls)));
      getFavoriteContributionIds(uid).then((ids) => !cancelled && setFavoriteContributionIds(new Set(ids)));
      fetchContributions('product').then((result) => !cancelled && setProductContributions(result));
      fetchContributions('podcast').then((result) => {
        if (cancelled) return;
        setPodcastContributions(result);
        fetchContributorPhotos(result).then((photos) => !cancelled && setContributorPhotos(photos));
      });
      fetchContributions('article').then((result) => !cancelled && setArticleContributions(result));
      return () => {
        cancelled = true;
      };
    }, [user, familyUid])
  );

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

  const toggleResourceFavorite = async (item: { url: string }) => {
    const wasFavorited = favoriteResourceUrls.has(item.url);
    setFavoriteResourceUrls((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(item.url) : next.add(item.url);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteResource(item.url) : addFavoriteResource(item.url));
    } catch {
      setFavoriteResourceUrls((prev) => {
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

  // Super Admin only — see components/SquareCard.tsx's onDelete comment.
  const deleteProduct = async (product: RecommendedProduct) => {
    setProducts((prev) => prev?.filter((p) => p.url !== product.url) ?? prev);
    try {
      await hideContent(productKey(product.url), product.title);
    } catch (err: any) {
      showAlert('Couldn’t remove that product', err?.message ?? err?.code ?? 'Please try again.');
      setProducts((prev) => (prev ? [...prev, product] : prev));
    }
  };

  const deletePodcast = async (podcast: PodcastSuggestion) => {
    setPodcasts((prev) => prev?.filter((p) => p.id !== podcast.id) ?? prev);
    try {
      await hideContent(podcastKey(podcast.id), podcast.title || 'Untitled podcast');
    } catch (err: any) {
      showAlert('Couldn’t remove that podcast', err?.message ?? err?.code ?? 'Please try again.');
      setPodcasts((prev) => (prev ? [...prev, podcast] : prev));
    }
  };

  const deleteArticle = async (article: HealthResource) => {
    setArticles((prev) => prev?.filter((a) => a.url !== article.url) ?? prev);
    try {
      await hideContent(articleKey(article.url), article.title);
    } catch (err: any) {
      showAlert('Couldn’t remove that article', err?.message ?? err?.code ?? 'Please try again.');
      setArticles((prev) => (prev ? [...prev, article] : prev));
    }
  };

  const deleteBlogPost = async (post: BlogPost) => {
    setBlogPosts((prev) => prev?.filter((p) => p.url !== post.url) ?? prev);
    try {
      await hideContent(blogKey(post.url), post.title);
    } catch (err: any) {
      showAlert('Couldn’t remove that blog post', err?.message ?? err?.code ?? 'Please try again.');
      setBlogPosts((prev) => (prev ? [...prev, post] : prev));
    }
  };

  const deleteContributionItem = async (
    c: Contribution,
    setter: Dispatch<SetStateAction<Contribution[]>>
  ) => {
    setter((prev) => prev.filter((x) => x.id !== c.id));
    try {
      await hideContent(contributionKey(c.id), c.fields.title ?? 'Community pick');
    } catch (err: any) {
      showAlert('Couldn’t remove that item', err?.message ?? err?.code ?? 'Please try again.');
      setter((prev) => [...prev, c]);
    }
  };

  // --- Build one unified card list per kind -------------------------------

  const productItems = useMemo<ExploreItem[]>(() => {
    const curated: ExploreItem[] = (products ?? []).map((product) => ({
      key: `product-${product.url}`,
      kind: 'product',
      title: product.title,
      subtitle: productSubtitle(product),
      image: product.imageUrl ? { uri: product.imageUrl } : undefined,
      matchedTags: product.matchedTags,
      favorited: favoriteProductUrls.has(product.url),
      onToggleFavorite: () => toggleProductFavorite(product),
      onDelete: isAdmin ? () => deleteProduct(product) : undefined,
      onPress: () =>
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
        }),
    }));
    const contributed: ExploreItem[] = productContributions.map((c) => ({
      key: `product-c-${c.id}`,
      kind: 'product',
      title: c.fields.title ?? 'Community pick',
      image: c.fields.imageUrl ? { uri: c.fields.imageUrl } : undefined,
      icon: c.fields.imageUrl ? undefined : 'bag-outline',
      matchedTags: [],
      community: true,
      favorited: favoriteContributionIds.has(c.id),
      onToggleFavorite: () => toggleContributionFavorite(c.id),
      onDelete: isAdmin ? () => deleteContributionItem(c, setProductContributions) : undefined,
      onPress: () =>
        router.push({
          pathname: '/contribution/[id]',
          params: { id: c.id, type: 'product', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
        }),
    }));
    return [...curated, ...contributed];
  }, [products, productContributions, favoriteProductUrls, favoriteContributionIds, isAdmin]);

  const podcastItems = useMemo<ExploreItem[]>(() => {
    const curated: ExploreItem[] = (podcasts ?? []).map((podcast) => ({
      key: `podcast-${podcast.id}`,
      kind: 'podcast',
      title: podcast.title || 'Untitled podcast',
      subtitle: podcastSubtitle(podcast),
      image: podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined,
      matchedTags: podcast.matchedTags,
      favorited: favoritePodcastIds.has(podcast.id),
      onToggleFavorite: () => togglePodcastFavorite(podcast),
      onDelete: isAdmin ? () => deletePodcast(podcast) : undefined,
      onPress: () =>
        router.push({
          pathname: '/podcast/[id]',
          params: {
            id: podcast.id,
            title: podcast.title,
            artist: podcast.artist,
            artworkUrl: podcast.artworkUrl ?? '',
            viewUrl: podcast.viewUrl ?? '',
            feedUrl: podcast.feedUrl ?? '',
            trackCount: podcast.trackCount != null ? String(podcast.trackCount) : '',
            genres: podcast.genres.join(','),
            matchedTags: podcast.matchedTags.join(','),
          },
        }),
    }));
    const contributed: ExploreItem[] = podcastContributions.map((c) => ({
      key: `podcast-c-${c.id}`,
      kind: 'podcast',
      title: c.fields.title ?? 'Community pick',
      icon: 'mic-outline',
      matchedTags: [],
      community: true,
      contributedBy: c.contributedByName,
      contributorPhoto: contributorPhotos.get(c.contributedByUid),
      favorited: favoriteContributionIds.has(c.id),
      onToggleFavorite: () => toggleContributionFavorite(c.id),
      onDelete: isAdmin ? () => deleteContributionItem(c, setPodcastContributions) : undefined,
      onPress: () =>
        router.push({
          pathname: '/contribution/[id]',
          params: { id: c.id, type: 'podcast', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
        }),
    }));
    return [...curated, ...contributed];
  }, [podcasts, podcastContributions, contributorPhotos, favoritePodcastIds, favoriteContributionIds, isAdmin]);

  const resourceItems = useMemo<ExploreItem[]>(() => {
    const curatedArticles: ExploreItem[] = (articles ?? []).map((article) => ({
      key: `resource-${article.url}`,
      kind: 'resource',
      title: article.title,
      subtitle: resourceSubtitle(article),
      icon: 'document-text-outline',
      matchedTags: article.matchedTags,
      favorited: favoriteResourceUrls.has(article.url),
      onToggleFavorite: () => toggleResourceFavorite(article),
      onDelete: isAdmin ? () => deleteArticle(article) : undefined,
      onPress: () =>
        router.push({
          pathname: '/article/[id]',
          params: {
            id: encodeURIComponent(article.url),
            title: article.title,
            summary: article.summary,
            url: article.url,
            matchedTags: article.matchedTags.join(','),
          },
        }),
    }));
    const blogs: ExploreItem[] = (blogPosts ?? []).map((post) => ({
      key: `resource-blog-${post.url}`,
      kind: 'resource',
      title: post.title,
      subtitle: blogPostSubtitle(post),
      icon: 'newspaper-outline',
      matchedTags: [],
      favorited: favoriteResourceUrls.has(post.url),
      onToggleFavorite: () => toggleResourceFavorite(post),
      onDelete: isAdmin ? () => deleteBlogPost(post) : undefined,
      onPress: () =>
        router.push({
          pathname: '/article/[id]',
          params: { id: encodeURIComponent(post.url), title: post.title, summary: post.snippet, url: post.url, source: post.source },
        }),
    }));
    const contributed: ExploreItem[] = articleContributions.map((c) => {
      const subtype = resourceSubtypeOf(c);
      const schema = RESOURCE_SUBTYPE_SCHEMAS[subtype];
      return {
        key: `resource-c-${c.id}`,
        kind: 'resource',
        title: c.fields.title ?? 'Community pick',
        subtitle: subtype === 'referral' ? c.fields.specialty : undefined,
        icon: schema.icon === 'referral' || schema.icon === 'blog' ? 'document-text-outline' : schema.icon,
        matchedTags: [],
        community: true,
        favorited: favoriteContributionIds.has(c.id),
        onToggleFavorite: () => toggleContributionFavorite(c.id),
        onDelete: isAdmin ? () => deleteContributionItem(c, setArticleContributions) : undefined,
        onPress: () =>
          router.push({
            pathname: '/contribution/[id]',
            params: { id: c.id, type: 'article', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
          }),
      };
    });
    return [...curatedArticles, ...blogs, ...contributed];
  }, [articles, blogPosts, articleContributions, favoriteResourceUrls, favoriteContributionIds, isAdmin]);

  const allItems = useMemo(() => [...productItems, ...podcastItems, ...resourceItems], [productItems, podcastItems, resourceItems]);

  // --- Default view: relevance rows, grouped by matched tag ---------------

  const feedRows = useMemo(() => {
    // One row for every item that matched at least one of the family's own
    // tags — a per-tag row (one per neurodivergence tag) put the same item
    // in every row it matched, so anything overlapping two tags visibly
    // duplicated on screen.
    const matchedItems = allItems.filter((item) => item.matchedTags.length > 0);
    const matchedRow = matchedItems.length
      ? [{ key: 'recommended', eyebrow: 'MATCHED TO YOUR FAMILY', title: 'Recommended for you', items: matchedItems }]
      : [];
    const communityItems = allItems.filter((item) => item.community);
    const communityRow = communityItems.length
      ? [{ key: 'community', eyebrow: 'FROM OTHER FAMILIES', title: 'Shared by families like yours', items: communityItems }]
      : [];
    // Health articles/blog posts routinely come back with no matched tag at
    // all (MedlinePlus/a blog's RSS feed has no neurodivergence data to
    // match against) — without this row, anything with an empty
    // matchedTags AND not a community pick belonged to neither row above
    // and silently vanished from the feed.
    const leftoverItems = allItems.filter((item) => !item.community && item.matchedTags.length === 0);
    const leftoverRow = leftoverItems.length
      ? [{ key: 'more', eyebrow: 'MORE TO EXPLORE', title: matchedItems.length > 0 ? 'More for your family' : 'Recommended for you', items: leftoverItems }]
      : [];
    return [...matchedRow, ...communityRow, ...leftoverRow];
  }, [allItems]);

  // Quick filter (always visible, not gated behind the search icon) — narrows
  // the feed to just one kind while keeping its row/eyebrow grouping, rather
  // than dropping into the flat search grid.
  const visibleFeedRows = useMemo(() => {
    if (typeFilter === 'all') return feedRows;
    return feedRows
      .map((row) => ({ ...row, items: row.items.filter((item) => item.kind === typeFilter) }))
      .filter((row) => row.items.length > 0);
  }, [feedRows, typeFilter]);

  // --- Search/filter view: a flat grid, only shown once opened ------------

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = allItems.filter((item) => {
      if (typeFilter !== 'all' && item.kind !== typeFilter) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortFavoritedFirst(matches, (item) => item.favorited);
  }, [allItems, query, typeFilter]);

  const submitContribution = async (name: string, values: Record<string, string>) => {
    if (!contributeOption) return;
    const { type, subtype } = contributeOption;
    await createContribution(type, subtype ? { ...values, resourceType: subtype } : values, name);
    const result = await fetchContributions(type);
    if (type === 'product') setProductContributions(result);
    else if (type === 'podcast') setPodcastContributions(result);
    else setArticleContributions(result);
  };

  const loadError = productsError && podcastsError && articlesError ? productsError : null;
  const doneLoading = products !== null || podcasts !== null || articles !== null || Boolean(loadError);
  const cardSize = isDesktop ? DESKTOP_CARD_WIDTH : undefined;

  function renderCard(item: ExploreItem) {
    return (
      <SquareCard
        key={item.key}
        title={item.title}
        subtitle={item.subtitle}
        image={item.image}
        icon={item.icon}
        community={item.community}
        contributedBy={item.contributedBy}
        contributorPhoto={item.contributorPhoto}
        favorited={item.favorited}
        onToggleFavorite={item.onToggleFavorite}
        onDelete={item.onDelete}
        size={cardSize}
        onPress={item.onPress}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Opened Circle" />

      <View style={styles.titleRow}>
        <View>
          <Text style={styles.pageTitle}>Resources</Text>
          <Text style={styles.pageSub}>Explore products, podcasts, and articles picked for your family.</Text>
        </View>
        <Pressable
          style={[styles.searchToggle, searchOpen && styles.searchToggleActive]}
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={8}
        >
          <Ionicons name="search" size={18} color={searchOpen ? colors.surface : colors.text} />
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {TYPE_FILTERS.map((key) => {
          const active = typeFilter === key;
          const label = key === 'all' ? 'All' : KIND_META[key].label;
          return (
            <Pressable
              key={key}
              style={[styles.typeChip, active && styles.typeChipActive]}
              onPress={() => setTypeFilter(key)}
            >
              <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {searchOpen ? (
        <View style={styles.searchPanel}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search products, podcasts, resources" />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.contributeButton} onPress={() => setPickerVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute</Text>
        </Pressable>

        {loadError ? <EmptyState text={`Couldn’t load Resources (${loadError}).`} /> : null}
        {!doneLoading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {searchOpen ? (
          <>
            <Text style={styles.resultCount}>
              {doneLoading ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}` : ''}
            </Text>
            {doneLoading && searchResults.length === 0 ? (
              <EmptyState text="Nothing matches that search." />
            ) : (
              <View style={styles.flatGrid}>{searchResults.map(renderCard)}</View>
            )}
          </>
        ) : doneLoading && visibleFeedRows.length === 0 ? (
          <EmptyState text={typeFilter === 'all' ? 'Nothing to show yet.' : `No ${KIND_META[typeFilter].label.toLowerCase()} to show yet.`} />
        ) : (
          visibleFeedRows.map((row) => (
            <View key={row.key} style={styles.rowBlock}>
              <Text style={styles.rowEyebrow}>{row.eyebrow}</Text>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
                {row.items.map(renderCard)}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>What are you contributing?</Text>
            {CONTRIBUTE_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                style={styles.pickerOption}
                onPress={() => {
                  setPickerVisible(false);
                  setContributeOption(option);
                }}
              >
                <View style={styles.pickerIconWrap}>
                  {option.icon === 'referral' ? (
                    <ReferralIcon size={18} color={colors.accent} />
                  ) : option.icon === 'blog' ? (
                    <BlogIcon size={18} color={colors.accent} />
                  ) : (
                    <Ionicons name={option.icon} size={18} color={colors.accent} />
                  )}
                </View>
                <Text style={styles.pickerOptionText}>{option.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <ContributeModal
        visible={contributeOption !== null}
        title={`Contribute ${contributeOption?.label.toLowerCase().startsWith('a') ? 'an' : 'a'} ${
          contributeOption ? (contributeOption.subtype ? RESOURCE_SUBTYPE_SCHEMAS[contributeOption.subtype].noun : CONTRIBUTION_SCHEMAS[contributeOption.type].noun) : ''
        }`}
        fields={contributeOption ? (contributeOption.subtype ? RESOURCE_SUBTYPE_SCHEMAS[contributeOption.subtype].fields : CONTRIBUTION_SCHEMAS[contributeOption.type].fields) : []}
        defaultName={user?.displayName ?? ''}
        validate={contributeOption?.subtype === 'referral' ? validateReferralContact : undefined}
        onClose={() => setContributeOption(null)}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  pageSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 260,
  },
  searchToggle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchToggleActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  searchPanel: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.surface,
  },
  content: {
    padding: 20,
    paddingTop: 12,
  },
  spinner: {
    marginVertical: 12,
  },
  resultCount: {
    fontSize: 12,
    color: colors.caption,
    marginBottom: 10,
  },
  flatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rowBlock: {
    marginBottom: 22,
  },
  rowEyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.accent,
    marginBottom: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  hrow: {
    gap: 12,
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
