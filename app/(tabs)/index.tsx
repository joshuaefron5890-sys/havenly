import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ImageSourcePropType, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { SectionHero } from '../../components/SectionHero';
import { CARD_WIDTH, SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { Contribution, fetchContributions } from '../../lib/contributions';
import { eventSubtitle, fetchNearbyEvents, NearbyEvent } from '../../lib/events';
import {
  fetchAcceptedProposals,
  fetchLatestProposal,
  fetchPendingProposals,
  PlaydateProposal,
  proposalStartLabel,
} from '../../lib/playdateProposals';
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

const PAGE_SIZE = 6;
// Articles stayed a row list (see the section below) rather than joining
// the square-card grid — a lone document icon centered in a big square
// looked odd next to cards with real photos, and a text-heavy row reads
// better anyway. A row list is denser than a 3-wide grid, so it gets its
// own, smaller cap.
const ARTICLE_PAGE_SIZE = 3;
const GRID_GAP = 10;

// Every square-card grid collapses to exactly one row by default — how
// many cards that is depends on the actual measured width of the grid
// (varies by device/window), so it's computed from a live layout
// measurement rather than a fixed guess.
function cardsPerRow(gridWidth: number | null): number {
  if (!gridWidth) return 4;
  return Math.max(1, Math.floor((gridWidth + GRID_GAP) / (CARD_WIDTH + GRID_GAP)));
}

// Only offers the toggle once there's actually more than pageSize to show
// — no "View all" on a list that's already fully visible.
function expandAction(count: number, expanded: boolean, setExpanded: (v: boolean) => void, pageSize = PAGE_SIZE) {
  if (count <= pageSize) return {};
  return { action: expanded ? 'Show less' : 'View all', onAction: () => setExpanded(!expanded) };
}

// Products/Podcasts/Articles each have their own dedicated tab now (see
// app/(tabs)/products.tsx etc.) — "View all" on the Home page navigates
// there instead of expanding in place, unlike Families/Events which have
// no such destination and still expand inline.
function viewAllAction(count: number, pageSize: number, onPress: () => void) {
  if (count <= pageSize) return {};
  return { action: 'View all', onAction: onPress };
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

  // Measured once from a zero-height spacer at the top of the scroll
  // content — its width equals the grids' own width (both sit inside the
  // same padded content container), and is what determines how many cards
  // make up "one row" below.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const perRow = cardsPerRow(gridWidth);

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
  // favoriting happens on the family detail screen, so coming back here
  // needs to pick up whatever changed there.
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
  const [productContributions, setProductContributions] = useState<Contribution[]>([]);

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
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Refetched on focus (not just mount) so a favorite/unfavorite made on the
  // product detail screen re-sorts this grid on the way back.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoriteProductUrls(user.uid).then((urls) => {
        if (!cancelled) setFavoriteProductUrls(new Set(urls));
      });
      fetchContributions('product').then((result) => {
        if (!cancelled) setProductContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

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
  const [podcastContributions, setPodcastContributions] = useState<Contribution[]>([]);

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
    return () => {
      cancelled = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoritePodcastIds(user.uid).then((ids) => {
        if (!cancelled) setFavoritePodcastIds(new Set(ids));
      });
      fetchContributions('podcast').then((result) => {
        if (!cancelled) setPodcastContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

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
  const [articleContributions, setArticleContributions] = useState<Contribution[]>([]);

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
    return () => {
      cancelled = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoriteResourceUrls(user.uid).then((urls) => {
        if (!cancelled) setFavoriteResourceUrls(new Set(urls));
      });
      fetchContributions('article').then((result) => {
        if (!cancelled) setArticleContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

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

  // Events
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlaydateProposal | null>(null);
  const [proposalFamilyPhotos, setProposalFamilyPhotos] = useState<[string | null, string | null] | null>(null);
  const [eventContributions, setEventContributions] = useState<Contribution[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchNearbyEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((err: any) => {
        if (!cancelled) setEventsError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Re-checked on focus (not just mount) so sending a proposal and coming
  // back here shows it right away.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      fetchLatestProposal().then((result) => {
        if (!cancelled) setProposal(result);
      });
      fetchContributions('event').then((result) => {
        if (!cancelled) setEventContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  // Both families involved in the proposal, for the side-by-side avatar
  // pair on its card — not just "the other family", so the card reads the
  // same regardless of whether the viewer proposed or was proposed to.
  useEffect(() => {
    if (!proposal) {
      setProposalFamilyPhotos(null);
      return;
    }
    let cancelled = false;
    fetchFamiliesByUids([proposal.fromUid, proposal.toUid]).then((result) => {
      if (cancelled) return;
      const byUid = new Map(result.map((f) => [f.uid, familyPhoto(f)]));
      setProposalFamilyPhotos([byUid.get(proposal.fromUid) ?? null, byUid.get(proposal.toUid) ?? null]);
    });
    return () => {
      cancelled = true;
    };
  }, [proposal]);

  // For You — a cross-category highlight reel above everything else,
  // prioritized in a fixed order: a confirmed playdate is the single most
  // actionable thing on the whole dashboard, then a proposed-but-not-yet-
  // answered playdate (still needs someone to act on it), then anything
  // already favorited (a signal the user gave directly), then families
  // the match algorithm rates especially highly but haven't been
  // favorited yet.
  const [confirmedProposals, setConfirmedProposals] = useState<PlaydateProposal[]>([]);
  const [confirmedProposalPhotos, setConfirmedProposalPhotos] = useState<
    Record<string, [string | null, string | null]>
  >({});
  const [pendingProposals, setPendingProposals] = useState<PlaydateProposal[]>([]);
  const [pendingProposalPhotos, setPendingProposalPhotos] = useState<
    Record<string, [string | null, string | null]>
  >({});
  const [forYouExpanded, setForYouExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      fetchAcceptedProposals().then((result) => {
        if (!cancelled) setConfirmedProposals(result);
      });
      fetchPendingProposals().then((result) => {
        if (!cancelled) setPendingProposals(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  useEffect(() => {
    if (!confirmedProposals.length) {
      setConfirmedProposalPhotos({});
      return;
    }
    let cancelled = false;
    const uids = [...new Set(confirmedProposals.flatMap((p) => [p.fromUid, p.toUid]))];
    fetchFamiliesByUids(uids).then((result) => {
      if (cancelled) return;
      const byUid = new Map(result.map((f) => [f.uid, familyPhoto(f)]));
      const photos: Record<string, [string | null, string | null]> = {};
      for (const p of confirmedProposals) {
        photos[p.id] = [byUid.get(p.fromUid) ?? null, byUid.get(p.toUid) ?? null];
      }
      setConfirmedProposalPhotos(photos);
    });
    return () => {
      cancelled = true;
    };
  }, [confirmedProposals]);

  useEffect(() => {
    if (!pendingProposals.length) {
      setPendingProposalPhotos({});
      return;
    }
    let cancelled = false;
    const uids = [...new Set(pendingProposals.flatMap((p) => [p.fromUid, p.toUid]))];
    fetchFamiliesByUids(uids).then((result) => {
      if (cancelled) return;
      const byUid = new Map(result.map((f) => [f.uid, familyPhoto(f)]));
      const photos: Record<string, [string | null, string | null]> = {};
      for (const p of pendingProposals) {
        photos[p.id] = [byUid.get(p.fromUid) ?? null, byUid.get(p.toUid) ?? null];
      }
      setPendingProposalPhotos(photos);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingProposals]);

  type Highlight = {
    key: string;
    title: string;
    subtitle?: string;
    image?: ImageSourcePropType;
    pairImages?: [ImageSourcePropType | undefined, ImageSourcePropType | undefined];
    icon?: 'calendar' | 'document-text-outline';
    badge: string;
    badgeVariant?: 'accent' | 'positive';
    onPress: () => void;
  };

  const highlights = useMemo<Highlight[]>(() => {
    const confirmed: Highlight[] = confirmedProposals.map((p) => {
      const photos = confirmedProposalPhotos[p.id];
      return {
        key: `confirmed-${p.id}`,
        title: proposalStartLabel(p),
        subtitle: p.venue,
        pairImages: photos
          ? [photos[0] ? { uri: photos[0] } : undefined, photos[1] ? { uri: photos[1] } : undefined]
          : undefined,
        icon: 'calendar',
        badge: 'Confirmed',
        badgeVariant: 'positive',
        onPress: () => router.push(`/proposal/${p.id}`),
      };
    });

    const proposed: Highlight[] = pendingProposals.map((p) => {
      const photos = pendingProposalPhotos[p.id];
      return {
        key: `proposed-${p.id}`,
        title: proposalStartLabel(p),
        subtitle: p.venue,
        pairImages: photos
          ? [photos[0] ? { uri: photos[0] } : undefined, photos[1] ? { uri: photos[1] } : undefined]
          : undefined,
        icon: 'calendar',
        badge: 'Proposed',
        onPress: () => router.push(`/proposal/${p.id}`),
      };
    });

    const favoritedFamilies: Highlight[] = mergedFamilies
      .filter((f) => favoriteFamilyUids.has(f.uid))
      .map((f) => {
        const photoUrl = familyPhoto(f);
        return {
          key: `family-${f.uid}`,
          title: familyDisplayName(f),
          subtitle: familySubtitle(f),
          image: photoUrl ? { uri: photoUrl } : undefined,
          badge: 'Favorited',
          onPress: () => router.push(`/family/${f.uid}`),
        };
      });
    const favoritedProducts: Highlight[] = (products ?? [])
      .filter((p) => favoriteProductUrls.has(p.url))
      .map((p) => ({
        key: `product-${p.url}`,
        title: p.title,
        subtitle: productSubtitle(p),
        image: p.imageUrl ? { uri: p.imageUrl } : undefined,
        badge: 'Favorited',
        onPress: () =>
          router.push({
            pathname: '/product/[id]',
            params: {
              id: encodeURIComponent(p.url),
              title: p.title,
              vendor: p.vendor,
              source: p.source,
              imageUrl: p.imageUrl ?? '',
              url: p.url,
              description: p.description,
              matchedTags: p.matchedTags.join(','),
            },
          }),
      }));
    const favoritedPodcasts: Highlight[] = (podcasts ?? [])
      .filter((p) => favoritePodcastIds.has(p.id))
      .map((p) => ({
        key: `podcast-${p.id}`,
        title: p.title || 'Untitled podcast',
        subtitle: podcastSubtitle(p),
        image: p.artworkUrl ? { uri: p.artworkUrl } : undefined,
        badge: 'Favorited',
        onPress: () =>
          router.push({
            pathname: '/podcast/[id]',
            params: {
              id: p.id,
              title: p.title,
              artist: p.artist,
              artworkUrl: p.artworkUrl ?? '',
              viewUrl: p.viewUrl ?? '',
              feedUrl: p.feedUrl ?? '',
              trackCount: p.trackCount != null ? String(p.trackCount) : '',
              genres: p.genres.join(','),
              matchedTags: p.matchedTags.join(','),
            },
          }),
      }));
    const favoritedArticles: Highlight[] = (articles ?? [])
      .filter((a) => favoriteResourceUrls.has(a.url))
      .map((a) => ({
        key: `article-${a.url}`,
        title: a.title,
        subtitle: resourceSubtitle(a),
        icon: 'document-text-outline',
        badge: 'Favorited',
        onPress: () =>
          router.push({
            pathname: '/article/[id]',
            params: {
              id: encodeURIComponent(a.url),
              title: a.title,
              summary: a.summary,
              url: a.url,
              matchedTags: a.matchedTags.join(','),
            },
          }),
      }));

    // 95%+ matches that aren't already surfaced above as a favorite —
    // favoriting already outranks match score, so a family shouldn't get
    // two cards.
    const topMatches: Highlight[] = mergedFamilies
      .filter((f) => f.matchScore >= 95 && !favoriteFamilyUids.has(f.uid))
      .sort((a, b) => b.matchScore - a.matchScore)
      .map((f) => {
        const photoUrl = familyPhoto(f);
        return {
          key: `match-${f.uid}`,
          title: familyDisplayName(f),
          subtitle: familySubtitle(f),
          image: photoUrl ? { uri: photoUrl } : undefined,
          badge: `${f.matchScore}% match`,
          onPress: () => router.push(`/family/${f.uid}`),
        };
      });

    return [
      ...confirmed,
      ...proposed,
      ...favoritedFamilies,
      ...favoritedProducts,
      ...favoritedPodcasts,
      ...favoritedArticles,
      ...topMatches,
    ];
  }, [
    confirmedProposals,
    confirmedProposalPhotos,
    pendingProposals,
    pendingProposalPhotos,
    mergedFamilies,
    favoriteFamilyUids,
    products,
    favoriteProductUrls,
    podcasts,
    favoritePodcastIds,
    articles,
    favoriteResourceUrls,
  ]);

  const forYouLoading = familiesLoading && products === null && podcasts === null && articles === null;

  // Each preview row below caps at one row (perRow, or ARTICLE_PAGE_SIZE for
  // the article list) — community contributions get first claim on those
  // slots (per the same "community first" ordering as the dedicated tabs),
  // then whatever proposal/real-item slots remain get filled after.
  const eventProposalSlots = proposal ? 1 : 0;
  const shownEventContributions = eventContributions.slice(0, Math.max(0, perRow - eventProposalSlots));
  const shownEvents = (events ?? []).slice(
    0,
    Math.max(0, perRow - eventProposalSlots - shownEventContributions.length)
  );

  const shownProductContributions = productContributions.slice(0, perRow);
  const shownProducts = (sortedProducts ?? []).slice(0, Math.max(0, perRow - shownProductContributions.length));

  const shownPodcastContributions = podcastContributions.slice(0, perRow);
  const shownPodcasts = (sortedPodcasts ?? []).slice(0, Math.max(0, perRow - shownPodcastContributions.length));

  const shownArticleContributions = articleContributions.slice(0, ARTICLE_PAGE_SIZE);
  const shownArticles = (sortedArticles ?? []).slice(
    0,
    Math.max(0, ARTICLE_PAGE_SIZE - shownArticleContributions.length)
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />

      <ScrollView contentContainerStyle={styles.content}>
        <View onLayout={(e) => setGridWidth((prev) => prev ?? e.nativeEvent.layout.width)} />

        <SectionHero
          imageUrl="https://picsum.photos/seed/havenly-for-you/800/450"
          title="For You"
          description="Curates your confirmed and proposed playdates, anything you've favorited, and families that are an especially strong match — all in one place."
        />
        {forYouLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : highlights.length === 0 ? (
          <EmptyState text="Nothing to highlight yet — favorite a family or pick, or confirm a playdate, and it'll show up here." />
        ) : (
          <>
            <SectionHeader
              title="Highlights"
              {...expandAction(highlights.length, forYouExpanded, setForYouExpanded, perRow)}
            />
            <View style={styles.grid}>
              {(forYouExpanded ? highlights : highlights.slice(0, perRow)).map((h) => (
                <SquareCard
                  key={h.key}
                  title={h.title}
                  subtitle={h.subtitle}
                  image={h.image}
                  pairImages={h.pairImages}
                  icon={h.icon}
                  badge={h.badge}
                  badgeVariant={h.badgeVariant}
                  onPress={h.onPress}
                />
              ))}
            </View>
          </>
        )}

        <SectionHeader
          title="Families like you"
          {...expandAction(mergedFamilies.length, familiesExpanded, setFamiliesExpanded, perRow)}
        />
        {familiesError ? (
          <EmptyState text={`Couldn’t load families (${familiesError}).`} />
        ) : familiesLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : mergedFamilies.length === 0 ? (
          <EmptyState text="No other families onboarded yet — check back soon." />
        ) : (
          <View style={styles.grid}>
            {(familiesExpanded ? mergedFamilies : mergedFamilies.slice(0, perRow)).map((family) => {
              const photoUrl = familyPhoto(family);
              return (
                <SquareCard
                  key={family.uid}
                  title={familyDisplayName(family)}
                  subtitle={familySubtitle(family)}
                  image={photoUrl ? { uri: photoUrl } : undefined}
                  favorited={favoriteFamilyUids.has(family.uid)}
                  onToggleFavorite={() => toggleFamilyFavorite(family)}
                  onPress={() => router.push(`/family/${family.uid}`)}
                />
              );
            })}
          </View>
        )}

        <SectionHeader
          title="Events"
          {...viewAllAction(
            (events?.length ?? 0) + eventProposalSlots + eventContributions.length,
            perRow,
            () => router.push('/(tabs)/events')
          )}
        />
        {eventsError ? <EmptyState text={`Couldn’t load events (${eventsError}).`} /> : null}
        {events === null && !eventsError ? <ActivityIndicator color={colors.accent} /> : null}
        {proposal || shownEventContributions.length > 0 || shownEvents.length > 0 ? (
          <View style={styles.grid}>
            {proposal ? (
              <SquareCard
                key={`proposal-${proposal.id}`}
                title={proposalStartLabel(proposal)}
                subtitle={proposal.venue}
                icon="calendar"
                pairImages={
                  proposalFamilyPhotos
                    ? [proposalFamilyPhotos[0] ? { uri: proposalFamilyPhotos[0] } : undefined, proposalFamilyPhotos[1] ? { uri: proposalFamilyPhotos[1] } : undefined]
                    : undefined
                }
                badge="Proposed"
                onPress={() => router.push(`/proposal/${proposal.id}`)}
              />
            ) : null}
            {shownEventContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community event'}
                icon="calendar-outline"
                community
                contributedBy={c.contributedByName}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'event', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName },
                  })
                }
              />
            ))}
            {shownEvents.map((event) => (
              <SquareCard
                key={event.id}
                title={event.title}
                subtitle={eventSubtitle(event)}
                image={event.imageUrl ? { uri: event.imageUrl } : undefined}
                icon={event.imageUrl ? undefined : 'calendar-outline'}
                onPress={() =>
                  router.push({
                    pathname: '/event/[id]',
                    params: {
                      id: String(event.id),
                      title: event.title,
                      eventDate: event.eventDate,
                      venue: event.venue,
                      address: event.address,
                      imageUrl: event.imageUrl ?? '',
                      link: event.link,
                      categories: event.categories.join(','),
                      distanceMiles: event.distanceMiles != null ? String(event.distanceMiles) : '',
                      virtual: String(event.virtual),
                    },
                  })
                }
              />
            ))}
          </View>
        ) : events !== null || eventsError ? (
          <EmptyState text="No upcoming events found — check back soon." />
        ) : null}

        <SectionHeader
          title="Products"
          {...viewAllAction(
            (sortedProducts?.length ?? 0) + productContributions.length,
            perRow,
            () => router.push('/(tabs)/products')
          )}
        />
        {productsError ? <EmptyState text={`Couldn’t load products (${productsError}).`} /> : null}
        {sortedProducts === null && !productsError ? <ActivityIndicator color={colors.accent} /> : null}
        {shownProductContributions.length > 0 || shownProducts.length > 0 ? (
          <View style={styles.grid}>
            {shownProductContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                icon="bag-outline"
                community
                contributedBy={c.contributedByName}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'product', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName },
                  })
                }
              />
            ))}
            {shownProducts.map((product) => (
              <SquareCard
                key={product.url}
                title={product.title}
                subtitle={productSubtitle(product)}
                image={product.imageUrl ? { uri: product.imageUrl } : undefined}
                favorited={favoriteProductUrls.has(product.url)}
                onToggleFavorite={() => toggleProductFavorite(product)}
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
        ) : sortedProducts !== null || productsError ? (
          <EmptyState text="Add your child's neurodivergence info to see product picks." />
        ) : null}

        <SectionHeader
          title="Podcasts"
          {...viewAllAction(
            (sortedPodcasts?.length ?? 0) + podcastContributions.length,
            perRow,
            () => router.push('/(tabs)/podcasts')
          )}
        />
        {podcastsError ? <EmptyState text={`Couldn’t load podcasts (${podcastsError}).`} /> : null}
        {sortedPodcasts === null && !podcastsError ? <ActivityIndicator color={colors.accent} /> : null}
        {shownPodcastContributions.length > 0 || shownPodcasts.length > 0 ? (
          <View style={styles.grid}>
            {shownPodcastContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                icon="mic-outline"
                community
                contributedBy={c.contributedByName}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'podcast', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName },
                  })
                }
              />
            ))}
            {shownPodcasts.map((podcast) => (
              <SquareCard
                key={podcast.id}
                title={podcast.title || 'Untitled podcast'}
                subtitle={podcastSubtitle(podcast)}
                image={podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined}
                favorited={favoritePodcastIds.has(podcast.id)}
                onToggleFavorite={() => togglePodcastFavorite(podcast)}
                onPress={() =>
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
                  })
                }
              />
            ))}
          </View>
        ) : sortedPodcasts !== null || podcastsError ? (
          <EmptyState text="Add your child's neurodivergence info to see podcast suggestions." />
        ) : null}

        <SectionHeader
          title="Articles"
          {...viewAllAction(
            (sortedArticles?.length ?? 0) + articleContributions.length,
            ARTICLE_PAGE_SIZE,
            () => router.push('/(tabs)/articles')
          )}
        />
        {articlesError ? <EmptyState text={`Couldn’t load articles (${articlesError}).`} /> : null}
        {sortedArticles === null && !articlesError ? <ActivityIndicator color={colors.accent} /> : null}
        {shownArticleContributions.length > 0 || shownArticles.length > 0 ? (
          <>
            {shownArticleContributions.map((c) => (
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
            {shownArticles.map((article) => (
              <ListRow
                key={article.url}
                title={article.title}
                subtitle={resourceSubtitle(article)}
                icon="document-text-outline"
                favorited={favoriteResourceUrls.has(article.url)}
                onToggleFavorite={() => toggleArticleFavorite(article)}
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
        ) : sortedArticles !== null || articlesError ? (
          <EmptyState text="Add your child's neurodivergence info to see relevant articles." />
        ) : null}
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
