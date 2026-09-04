import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ImageSourcePropType, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/AppText';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { Photo } from '../../components/Photo';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { CARD_WIDTH, SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { Contribution, fetchContributions, resourceSubtypeOf, RESOURCE_SUBTYPE_SCHEMAS } from '../../lib/contributions';
import { eventSubtitle, fetchNearbyEvents, NearbyEvent } from '../../lib/events';
import {
  fetchAcceptedProposals,
  fetchLatestProposal,
  fetchPendingProposals,
  PlaydateProposal,
  proposalStartLabel,
} from '../../lib/playdateProposals';
import {
  addFavoriteContribution,
  addFavoriteFamily,
  addFavoritePodcast,
  addFavoriteProduct,
  addFavoriteResource,
  getFavoriteContributionIds,
  getFavoriteEventIds,
  getFavoriteFamilyUids,
  getFavoritePodcastIds,
  getFavoriteProductUrls,
  getFavoriteResourceUrls,
  removeFavoriteContribution,
  removeFavoriteFamily,
  removeFavoritePodcast,
  removeFavoriteProduct,
  removeFavoriteResource,
} from '../../lib/favorites';
import {
  familyDisplayName,
  familyPhoto,
  familySubtitle,
  fetchContributorPhotos,
  fetchFamiliesByUids,
  fetchSuggestedFamilies,
  SuggestedFamily,
} from '../../lib/families';
import { fetchPodcastSuggestions, podcastSubtitle, PodcastSuggestion } from '../../lib/podcasts';
import { fetchRecommendedProducts, productSubtitle, RecommendedProduct } from '../../lib/products';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { useIsDesktop } from '../../lib/responsive';
import { fetchRecommendedSitters, RecommendedSitter, SITTERS_ENABLED } from '../../lib/sitters';
import { colors } from '../../theme/colors';
import { CalendarAgendaItem, dateKey, UpcomingEventsCalendar } from '../../components/UpcomingEventsCalendar';

// Articles stayed a row list (see the section below) rather than joining
// the square-card grid — a lone document icon centered in a big square
// looked odd next to cards with real photos, and a text-heavy row reads
// better anyway. A row list is denser than a 3-wide grid, so it gets its
// own, smaller cap.
const ARTICLE_PAGE_SIZE = 3;
const GRID_GAP = 10;
// The comfortable size range a preview card can flex within — wide enough
// to stay legible, narrow enough that a row can fit an extra card rather
// than leaving it just out of reach.
const MIN_CARD_SIZE = 70;
const MAX_CARD_SIZE = 92;
// Desktop gets meaningfully bigger cards, not just more of the same small
// ones — the mobile range above was still being applied verbatim on a wide
// desktop window, capping every thumbnail at 92px regardless of how much
// space was actually available.
const MIN_CARD_SIZE_DESKTOP = 120;
const MAX_CARD_SIZE_DESKTOP = 200;

// Every square-card grid on Home is exactly one row, sized to fill its own
// measured width edge to edge — not a fixed CARD_WIDTH with whatever
// slack happens to be left over after however many fit, which both wasted
// space and made "View all" (bound by the same content padding as the
// row, unlike the row's own former extra inset) land short of the row's
// real right edge. Tries column counts from most to least, picking the
// first whose resulting per-card size lands in the comfortable range —
// biased toward more, smaller cards, so a device that can fit 5 shows 5
// instead of capping at a fixed-width 4.
function computeGridLayout(gridWidth: number | null, isDesktop: boolean): { perRow: number; cardSize: number } {
  const minSize = isDesktop ? MIN_CARD_SIZE_DESKTOP : MIN_CARD_SIZE;
  const maxSize = isDesktop ? MAX_CARD_SIZE_DESKTOP : MAX_CARD_SIZE;
  const fallbackWidth = isDesktop ? MIN_CARD_SIZE_DESKTOP : CARD_WIDTH;
  if (!gridWidth) return { perRow: 4, cardSize: fallbackWidth };
  for (let n = 6; n >= 3; n--) {
    const cardSize = (gridWidth - (n - 1) * GRID_GAP) / n;
    if (cardSize >= minSize && cardSize <= maxSize) {
      return { perRow: n, cardSize };
    }
  }
  // Neither bound fit any of 3-6 columns (a very narrow or very wide
  // screen) — fall back to whatever's closest to the default card size.
  const n = Math.max(1, Math.round(gridWidth / (fallbackWidth + GRID_GAP)));
  return { perRow: n, cardSize: (gridWidth - (n - 1) * GRID_GAP) / n };
}

// Every section on Home now has its own dedicated tab (see
// app/(tabs)/products.tsx, families.tsx, etc.) — "View all" navigates
// there instead of expanding in place. Only offers the action once
// there's actually more than pageSize to show.
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
  const { user, familyUid } = useAuth();
  const myUid = familyUid ?? user?.uid;

  // Measured once from a zero-height spacer at the top of the scroll
  // content — its width equals the grids' own width (both sit inside the
  // same padded content container), and is what determines how many cards
  // make up "one row" below.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const isDesktop = useIsDesktop();
  const { perRow, cardSize } = computeGridLayout(gridWidth, isDesktop);

  // Shared across every section below — event/product/podcast/article
  // contributions all live in the same 'contributions' collection and
  // favorite field (see lib/favorites.ts), unlike curated content which
  // has a type-specific favorite field per section.
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      getFavoriteContributionIds(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoriteContributionIds(new Set(ids));
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

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

  // Also shared across every section — merged rather than replaced on each
  // section's own fetch, since two sections' contributors can overlap and
  // their fetches land independently of each other.
  const [contributorPhotos, setContributorPhotos] = useState<Map<string, string | null>>(new Map());
  const mergeContributorPhotos = (contributions: Contribution[]) => {
    fetchContributorPhotos(contributions).then((photos) => {
      setContributorPhotos((prev) => new Map([...prev, ...photos]));
    });
  };

  // Families
  const [families, setFamilies] = useState<SuggestedFamily[] | null>(null);
  const [familiesError, setFamiliesError] = useState<string | null>(null);
  const [favoriteFamilies, setFavoriteFamilies] = useState<SuggestedFamily[] | null>(null);
  const [favoriteFamilyUids, setFavoriteFamilyUids] = useState<Set<string>>(new Set());

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
      getFavoriteFamilyUids(familyUid ?? user.uid)
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
      getFavoriteProductUrls(familyUid ?? user.uid).then((urls) => {
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
      getFavoritePodcastIds(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoritePodcastIds(new Set(ids));
      });
      fetchContributions('podcast').then((result) => {
        if (!cancelled) setPodcastContributions(result);
        if (!cancelled) mergeContributorPhotos(result);
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
      getFavoriteResourceUrls(familyUid ?? user.uid).then((urls) => {
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
  const [favoriteEventIds, setFavoriteEventIds] = useState<Set<string>>(new Set());

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
      getFavoriteEventIds(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoriteEventIds(new Set(ids));
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

  // Confirmed and pending playdate proposals — Home's playdate section
  // (confirmed callout, or the Suggested Playdate fallback below) reads
  // confirmedProposals/pendingProposals directly; Favorites (further
  // below) no longer surfaces proposals at all, only actual favorites.
  const [confirmedProposals, setConfirmedProposals] = useState<PlaydateProposal[]>([]);
  const [pendingProposals, setPendingProposals] = useState<PlaydateProposal[]>([]);
  // Neither fetch above was previously tracked by any loading flag, so the
  // playdate section could flash "nothing confirmed" for a moment before
  // fetchAcceptedProposals actually resolved — this gates that decision
  // (see the Suggested Playdate branch below) until both have landed.
  const [proposalsLoaded, setProposalsLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      setProposalsLoaded(false);
      Promise.all([fetchAcceptedProposals(), fetchPendingProposals()]).then(([accepted, pending]) => {
        if (cancelled) return;
        setConfirmedProposals(accepted);
        setPendingProposals(pending);
        setProposalsLoaded(true);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  type FavoriteCard = {
    key: string;
    title: string;
    subtitle?: string;
    image?: ImageSourcePropType;
    pairImages?: [ImageSourcePropType | undefined, ImageSourcePropType | undefined];
    icon?: 'calendar' | 'document-text-outline';
    badge?: string;
    badgeVariant?: 'accent' | 'positive' | 'warning';
    matchScore?: number;
    // Plain favorites (families/products/podcasts/articles) show the same
    // corner heart used everywhere else instead of a separate text badge —
    // badge is reserved for a favorited event's "Added" (see
    // favoritedEvents below; that's the only card type that ever sets one).
    favorited?: boolean;
    onToggleFavorite?: () => void;
    // A specific family's own photo (favorited/top-match cards) rather than
    // generic content — shows a person silhouette instead of a bare color
    // block when that family has no photo on file.
    personFallback?: boolean;
    onPress: () => void;
  };

  // confirmedProposals is already sorted soonest-first, so the first one
  // that falls within the next 7 days (if any) is the one to surface in
  // its own full callout — when there isn't one, the Suggested Playdate
  // branch below takes that same slot instead.
  const upcomingPlaydate = useMemo(() => {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return confirmedProposals.find((p) => {
      const t = new Date(p.date).getTime();
      return !Number.isNaN(t) && t >= now && t <= now + oneWeekMs;
    });
  }, [confirmedProposals]);

  // Full profiles (name, kids, photo) for the upcoming callout's two
  // families — the callout needs more than just a photo URL to show
  // "who's coming."
  const [upcomingPlaydateFamilies, setUpcomingPlaydateFamilies] = useState<Record<string, SuggestedFamily>>({});

  useEffect(() => {
    if (!upcomingPlaydate) {
      setUpcomingPlaydateFamilies({});
      return;
    }
    let cancelled = false;
    fetchFamiliesByUids([upcomingPlaydate.fromUid, upcomingPlaydate.toUid]).then((result) => {
      if (cancelled) return;
      setUpcomingPlaydateFamilies(Object.fromEntries(result.map((f) => [f.uid, f])));
    });
    return () => {
      cancelled = true;
    };
  }, [upcomingPlaydate]);

  // My own family's public profile — just enough (photo) to show "you" as
  // one half of the avatar pair on the Suggested Playdate card, the same
  // way upcomingPlaydateFamilies does for the confirmed callout above.
  const [myFamily, setMyFamily] = useState<SuggestedFamily | null>(null);

  useEffect(() => {
    if (!myUid) return;
    let cancelled = false;
    fetchFamiliesByUids([myUid]).then((result) => {
      if (!cancelled) setMyFamily(result[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [myUid]);

  // The best family to suggest a playdate with, when there's no upcoming
  // one already: highest matchScore among families the viewer isn't
  // already mid-conversation with (pending or confirmed) — mergedFamilies
  // already combines favorited + suggested families (see mergeFamilies
  // above), so this reuses that same pool rather than a separate fetch.
  const proposedOrConfirmedUids = useMemo(
    () => new Set([...confirmedProposals, ...pendingProposals].flatMap((p) => [p.fromUid, p.toUid])),
    [confirmedProposals, pendingProposals]
  );
  const suggestedMatch = useMemo(() => {
    if (familiesLoading) return null;
    const candidates = mergedFamilies
      .filter((f) => f.uid !== myUid && !proposedOrConfirmedUids.has(f.uid))
      .sort((a, b) => b.matchScore - a.matchScore);
    return candidates[0] ?? null;
  }, [mergedFamilies, familiesLoading, myUid, proposedOrConfirmedUids]);

  // A provider to suggest as chaperone alongside the matched family —
  // fetchRecommendedSitters with no slot sorts purely by specialty overlap
  // (see lib/sitters.ts), so the first result is the closest specialty
  // match in the viewer's own cluster. Shown as a preview only: a sitter
  // can only actually be added to a playdate once it's accepted (see
  // addSitterToPlaydate/firestore.rules), so this isn't attached to
  // anything yet — confirming the suggested family still leaves finding
  // and adding a sitter as its own step later, same as any other playdate.
  const [suggestedSitter, setSuggestedSitter] = useState<RecommendedSitter | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user || !SITTERS_ENABLED) return;
      let cancelled = false;
      fetchRecommendedSitters()
        .then((result) => {
          if (!cancelled) setSuggestedSitter(result[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setSuggestedSitter(null);
        });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const favorites = useMemo<FavoriteCard[]>(() => {
    const favoritedEvents: FavoriteCard[] = (events ?? [])
      .filter((e) => favoriteEventIds.has(e.id))
      .map((e) => ({
        key: `event-${e.id}`,
        title: e.title,
        subtitle: eventSubtitle(e),
        image: e.imageUrl ? { uri: e.imageUrl } : undefined,
        icon: 'calendar',
        // These only ever land in favorites via the "Add to My Calendar"
        // flow (see app/event/[id].tsx) — "Added" reads more true to what
        // actually happened than the generic "Favorited" other card types use.
        badge: 'Added',
        badgeVariant: 'positive',
        onPress: () =>
          router.push({
            pathname: '/event/[id]',
            params: {
              id: String(e.id),
              title: e.title,
              source: e.source,
              eventDate: e.eventDate,
              venue: e.venue,
              address: e.address,
              imageUrl: e.imageUrl ?? '',
              link: e.link,
              categories: e.categories.join(','),
              distanceMiles: e.distanceMiles != null ? String(e.distanceMiles) : '',
              virtual: String(e.virtual),
            },
          }),
      }));

    const favoritedFamilies: FavoriteCard[] = mergedFamilies
      .filter((f) => favoriteFamilyUids.has(f.uid))
      .map((f) => {
        const photoUrl = familyPhoto(f);
        return {
          key: `family-${f.uid}`,
          title: familyDisplayName(f),
          subtitle: familySubtitle(f),
          image: photoUrl ? { uri: photoUrl } : undefined,
          favorited: true,
          onToggleFavorite: () => toggleFamilyFavorite(f),
          matchScore: f.matchScore,
          personFallback: true,
          onPress: () => router.push(`/family/${f.uid}`),
        };
      });
    const favoritedProducts: FavoriteCard[] = (products ?? [])
      .filter((p) => favoriteProductUrls.has(p.url))
      .map((p) => ({
        key: `product-${p.url}`,
        title: p.title,
        subtitle: productSubtitle(p),
        image: p.imageUrl ? { uri: p.imageUrl } : undefined,
        favorited: true,
        onToggleFavorite: () => toggleProductFavorite(p),
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
    const favoritedPodcasts: FavoriteCard[] = (podcasts ?? [])
      .filter((p) => favoritePodcastIds.has(p.id))
      .map((p) => ({
        key: `podcast-${p.id}`,
        title: p.title || 'Untitled podcast',
        subtitle: podcastSubtitle(p),
        image: p.artworkUrl ? { uri: p.artworkUrl } : undefined,
        favorited: true,
        onToggleFavorite: () => togglePodcastFavorite(p),
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
    const favoritedArticles: FavoriteCard[] = (articles ?? [])
      .filter((a) => favoriteResourceUrls.has(a.url))
      .map((a) => ({
        key: `article-${a.url}`,
        title: a.title,
        subtitle: resourceSubtitle(a),
        icon: 'document-text-outline',
        favorited: true,
        onToggleFavorite: () => toggleArticleFavorite(a),
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

    return [...favoritedEvents, ...favoritedFamilies, ...favoritedProducts, ...favoritedPodcasts, ...favoritedArticles];
  }, [
    events,
    favoriteEventIds,
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

  // Upcoming Events' calendar — every future proposal (confirmed or still
  // pending) plus every nearby event already fetched above, merged into
  // one date-sorted list. No new fetch: both sources are already loaded
  // for other sections on this screen.
  const calendarItems = useMemo(() => {
    const now = Date.now();
    type CalendarItem = { key: string; dateISO: string; title: string; subtitle: string; onPress: () => void };
    const proposalItems: CalendarItem[] = [...confirmedProposals, ...pendingProposals]
      .filter((p) => p.date)
      .map((p) => ({
        key: `proposal-${p.id}`,
        dateISO: p.date,
        title: proposalStartLabel(p),
        subtitle: p.venue || (p.status === 'accepted' ? 'Confirmed playdate' : 'Proposed playdate'),
        onPress: () => router.push(`/proposal/${p.id}`),
      }));
    const eventItems: CalendarItem[] = (events ?? []).map((e) => ({
      key: `event-${e.id}`,
      dateISO: e.eventDate,
      title: e.title,
      subtitle: eventSubtitle(e),
      onPress: () =>
        router.push({
          pathname: '/event/[id]',
          params: {
            id: String(e.id),
            title: e.title,
            source: e.source,
            eventDate: e.eventDate,
            venue: e.venue,
            address: e.address,
            imageUrl: e.imageUrl ?? '',
            link: e.link,
            categories: e.categories.join(','),
            distanceMiles: e.distanceMiles != null ? String(e.distanceMiles) : '',
            virtual: String(e.virtual),
          },
        }),
    }));
    return [...proposalItems, ...eventItems]
      .filter((item) => {
        const t = new Date(item.dateISO).getTime();
        return !Number.isNaN(t) && t >= now;
      })
      .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
  }, [confirmedProposals, pendingProposals, events]);

  const calendarMarkedDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of calendarItems) {
      const d = new Date(item.dateISO);
      if (!Number.isNaN(d.getTime())) keys.add(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return keys;
  }, [calendarItems]);

  const calendarAgenda: CalendarAgendaItem[] = calendarItems
    .slice(0, 3)
    .map(({ key, title, subtitle, onPress }) => ({ key, title, subtitle, onPress }));

  // Which side of the upcoming playdate is "my family" vs. the other one,
  // so the callout can show both — same fromUid/toUid disambiguation
  // app/proposal/[id].tsx already does.
  const myUpcomingUid = myUid;
  const otherUpcomingUid = upcomingPlaydate
    ? upcomingPlaydate.fromUid === myUpcomingUid
      ? upcomingPlaydate.toUid
      : upcomingPlaydate.fromUid
    : undefined;
  const myUpcomingFamily = myUpcomingUid ? upcomingPlaydateFamilies[myUpcomingUid] : undefined;
  const otherUpcomingFamily = otherUpcomingUid ? upcomingPlaydateFamilies[otherUpcomingUid] : undefined;

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

  // Favorited products/podcasts surface before community contributions,
  // same exception as Resources below — sortedProducts/sortedPodcasts
  // already list favorited ones first (sortFavoritedFirst), so counting
  // how many leading entries are favorited splits it without a second
  // filter pass.
  let favoritedProductCount = 0;
  while (
    favoritedProductCount < (sortedProducts?.length ?? 0) &&
    favoriteProductUrls.has(sortedProducts![favoritedProductCount].url)
  ) {
    favoritedProductCount++;
  }
  const shownFavoritedProducts = (sortedProducts ?? []).slice(0, Math.min(favoritedProductCount, perRow));
  const shownProductContributions = productContributions.slice(0, Math.max(0, perRow - shownFavoritedProducts.length));
  const shownProducts = (sortedProducts ?? []).slice(
    shownFavoritedProducts.length,
    shownFavoritedProducts.length + Math.max(0, perRow - shownFavoritedProducts.length - shownProductContributions.length)
  );

  let favoritedPodcastCount = 0;
  while (
    favoritedPodcastCount < (sortedPodcasts?.length ?? 0) &&
    favoritePodcastIds.has(sortedPodcasts![favoritedPodcastCount].id)
  ) {
    favoritedPodcastCount++;
  }
  const shownFavoritedPodcasts = (sortedPodcasts ?? []).slice(0, Math.min(favoritedPodcastCount, perRow));
  const shownPodcastContributions = podcastContributions.slice(0, Math.max(0, perRow - shownFavoritedPodcasts.length));
  const shownPodcasts = (sortedPodcasts ?? []).slice(
    shownFavoritedPodcasts.length,
    shownFavoritedPodcasts.length + Math.max(0, perRow - shownFavoritedPodcasts.length - shownPodcastContributions.length)
  );

  // Resources are the same exception to the "community first" ordering
  // above — a resource you've already favorited should surface before an
  // unfavorited community pick, not after. sortedArticles already lists
  // favorited ones first (sortFavoritedFirst), so counting how many of its
  // leading entries are favorited is enough to split it without a second
  // filter pass.
  let favoritedArticleCount = 0;
  while (
    favoritedArticleCount < (sortedArticles?.length ?? 0) &&
    favoriteResourceUrls.has(sortedArticles![favoritedArticleCount].url)
  ) {
    favoritedArticleCount++;
  }
  const shownFavoritedArticles = (sortedArticles ?? []).slice(0, Math.min(favoritedArticleCount, ARTICLE_PAGE_SIZE));
  const shownArticleContributions = articleContributions.slice(
    0,
    Math.max(0, ARTICLE_PAGE_SIZE - shownFavoritedArticles.length)
  );
  const shownArticles = (sortedArticles ?? []).slice(
    shownFavoritedArticles.length,
    shownFavoritedArticles.length + Math.max(0, ARTICLE_PAGE_SIZE - shownFavoritedArticles.length - shownArticleContributions.length)
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Opened Circle" />

      <ScrollView contentContainerStyle={styles.content}>
        <View
          onLayout={(e) => {
            // Read the width synchronously, before passing it into the
            // updater below — React can defer actually calling a
            // setState updater to a later render pass, and by then
            // React Native may have already recycled this synthetic
            // event, making e.nativeEvent null. That's what was crashing
            // in production (TypeError: Cannot read property 'layout' of
            // null) despite never reproducing in dev.
            const width = e.nativeEvent.layout.width;
            setGridWidth((prev) => prev ?? width);
          }}
        />

        {!proposalsLoaded ? (
          <ActivityIndicator color={colors.accent} style={styles.playdateLoading} />
        ) : upcomingPlaydate ? (
          <View style={[styles.playdateCallout, isDesktop && styles.playdateCalloutDesktop]}>
            <View style={styles.playdateCalloutMain}>
              <Pressable style={styles.playdateCalloutHeader} onPress={() => router.push(`/proposal/${upcomingPlaydate.id}`)}>
                <Text style={styles.playdateCalloutEyebrow}>UPCOMING PLAYDATE</Text>
                <Text style={styles.playdateCalloutTitle}>{proposalStartLabel(upcomingPlaydate)}</Text>
              </Pressable>

              <View style={styles.playdateCalloutFamiliesRow}>
                <View style={styles.playdateCalloutPhotos}>
                  <Photo
                    source={myUpcomingFamily && familyPhoto(myUpcomingFamily) ? { uri: familyPhoto(myUpcomingFamily)! } : undefined}
                    style={[styles.playdateCalloutAvatar, styles.playdateCalloutAvatarBack]}
                    variant="person"
                    iconSize={26}
                  />
                  <Photo
                    source={
                      otherUpcomingFamily && familyPhoto(otherUpcomingFamily) ? { uri: familyPhoto(otherUpcomingFamily)! } : undefined
                    }
                    style={[styles.playdateCalloutAvatar, styles.playdateCalloutAvatarFront]}
                    variant="person"
                    iconSize={26}
                  />
                </View>
                <View style={styles.playdateCalloutFamilyNames}>
                  <Text style={styles.playdateCalloutFamilyName} numberOfLines={1}>
                    {(myUpcomingFamily ? familyDisplayName(myUpcomingFamily) : 'Your family') +
                      ' & ' +
                      (otherUpcomingFamily ? familyDisplayName(otherUpcomingFamily) : '…')}
                  </Text>
                  <Text style={styles.playdateCalloutFamilyKids} numberOfLines={1}>
                    {[
                      myUpcomingFamily ? familySubtitle(myUpcomingFamily) : '',
                      otherUpcomingFamily ? familySubtitle(otherUpcomingFamily) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>

              {upcomingPlaydate.venue ? (
                <View style={styles.playdateCalloutInfoRow}>
                  <Ionicons name="location" size={15} color={colors.accent} />
                  <Text style={styles.playdateCalloutInfoText}>{upcomingPlaydate.venue}</Text>
                </View>
              ) : null}

              {SITTERS_ENABLED && upcomingPlaydate.sitter ? (
                <View style={styles.playdateCalloutSitterRow}>
                  <Photo
                    source={upcomingPlaydate.sitter.photoUrl ? { uri: upcomingPlaydate.sitter.photoUrl } : undefined}
                    style={styles.playdateCalloutSitterPhoto}
                    variant="person"
                    iconSize={16}
                  />
                  <View style={styles.playdateCalloutSitterInfo}>
                    <Text style={styles.playdateCalloutSitterName} numberOfLines={1}>
                      {upcomingPlaydate.sitter.name}
                    </Text>
                    <Text style={styles.playdateCalloutSitterMeta}>
                      {upcomingPlaydate.sitter.confirmationStatus === 'confirmed'
                        ? 'Sitter confirmed'
                        : upcomingPlaydate.sitter.confirmationStatus === 'declined'
                        ? 'Sitter declined — find another'
                        : 'Sitter added — pending confirmation'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={[styles.playdateCalloutActions, isDesktop && styles.playdateCalloutActionsDesktop]}>
              <View style={[styles.playdateCalloutBadge, styles.playdateCalloutBadgeConfirmed]}>
                <Ionicons name="checkmark-circle" size={13} color={colors.positive} />
                <Text style={[styles.playdateCalloutBadgeText, styles.playdateCalloutBadgeTextConfirmed]}>Confirmed</Text>
              </View>
              {SITTERS_ENABLED && !upcomingPlaydate.sitter ? (
                <Pressable
                  style={styles.playdateCalloutSitterCta}
                  onPress={() =>
                    router.push(`/find-sitter?proposalId=${upcomingPlaydate.id}&date=${encodeURIComponent(upcomingPlaydate.date)}`)
                  }
                >
                  <Ionicons name="heart-outline" size={15} color={colors.accent} />
                  <Text style={styles.playdateCalloutSitterCtaText}>Find a sitter for this playdate</Text>
                </Pressable>
              ) : null}

              <Pressable style={styles.playdateCalloutCta} onPress={() => router.push(`/proposal/${upcomingPlaydate.id}`)}>
                <Text style={styles.playdateCalloutCtaText}>View details</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.surface} />
              </Pressable>
            </View>
          </View>
        ) : (
          // No confirmed playdate in the next 7 days — rather than leave
          // this slot empty, suggest the best next match (see
          // suggestedMatch above) plus a provider to chaperone, so there's
          // always something actionable here. Same card shell/shape as the
          // confirmed state above, but its content is a suggestion, not a
          // real event yet — "Confirm details" hands off to the normal
          // propose flow (pre-filled with this family) rather than
          // pretending a date/venue/sitter are already locked in.
          <View style={[styles.playdateCallout, isDesktop && styles.playdateCalloutDesktop]}>
            <View style={styles.playdateCalloutMain}>
              <View style={styles.playdateCalloutHeader}>
                <View style={styles.pdEyebrowRow}>
                  <View style={styles.pdEyebrowIcon}>
                    <Ionicons name="sparkles" size={10} color={colors.accent} />
                  </View>
                  <Text style={styles.playdateCalloutEyebrow}>SUGGESTED PLAYDATE</Text>
                </View>
                <Text style={styles.playdateCalloutTitle}>
                  {suggestedMatch ? familyDisplayName(suggestedMatch) : 'Finding a match…'}
                </Text>
              </View>

              {suggestedMatch ? (
                <>
                  <View style={styles.playdateCalloutFamiliesRow}>
                    <View style={styles.pdPhotos}>
                      <Photo
                        source={myFamily && familyPhoto(myFamily) ? { uri: familyPhoto(myFamily)! } : undefined}
                        style={[styles.playdateCalloutAvatar, styles.playdateCalloutAvatarBack]}
                        variant="person"
                        iconSize={26}
                      />
                      <Photo
                        source={familyPhoto(suggestedMatch) ? { uri: familyPhoto(suggestedMatch)! } : undefined}
                        style={[styles.playdateCalloutAvatar, styles.playdateCalloutAvatarFront]}
                        variant="person"
                        iconSize={26}
                      />
                      {SITTERS_ENABLED && suggestedSitter ? (
                        <View style={styles.pdProviderWrap}>
                          <Photo
                            source={suggestedSitter.photoUrl ? { uri: suggestedSitter.photoUrl } : undefined}
                            style={styles.pdProvider}
                            variant="person"
                            iconSize={14}
                          />
                          <View style={styles.pdProviderBadge}>
                            <Ionicons name="shield-checkmark" size={8} color={colors.surface} />
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.playdateCalloutFamilyNames}>
                      <Text style={styles.playdateCalloutFamilyKids} numberOfLines={1}>
                        {familySubtitle(suggestedMatch)}
                      </Text>
                      {SITTERS_ENABLED && suggestedSitter ? (
                        <Text style={styles.playdateCalloutFamilyKids} numberOfLines={1}>
                          Suggested chaperone: {suggestedSitter.name}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.pdMatchPill}>
                    <Ionicons name="sparkles" size={11} color={colors.accent} />
                    <Text style={styles.pdMatchPillText}>Strong Match</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.playdateCalloutInfoText}>
                  No new matches right now — check back soon, or browse families yourself.
                </Text>
              )}
            </View>

            {suggestedMatch ? (
              <View style={[styles.playdateCalloutActions, isDesktop && styles.playdateCalloutActionsDesktop]}>
                <View style={[styles.playdateCalloutBadge, styles.playdateCalloutBadgeSuggested]}>
                  <Ionicons name="sparkles" size={11} color={colors.accent} />
                  <Text style={[styles.playdateCalloutBadgeText, styles.playdateCalloutBadgeTextSuggested]}>Suggested</Text>
                </View>
                <Pressable
                  style={styles.playdateCalloutCta}
                  onPress={() => router.push(`/propose-playdate?familyId=${suggestedMatch.uid}&source=suggested`)}
                >
                  <Text style={styles.playdateCalloutCtaText}>Confirm details</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.surface} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {/* On desktop, side by side — each gets half the row instead of
            the calendar stretching to the full width it doesn't need. On
            mobile, still stacked full-width; a phone doesn't have room
            for a legible 7-column grid at half width. */}
        <View style={[styles.eventsFavoritesRow, isDesktop && styles.eventsFavoritesRowDesktop]}>
          <View style={[styles.sectionCard, isDesktop && styles.eventsFavoritesCardDesktop]}>
            <View style={styles.sectionCardHead}>
              <View style={styles.sectionCardIconWrap}>
                <Ionicons name="calendar" size={13} color={colors.accent} />
              </View>
              <Text style={styles.sectionCardTitle}>Upcoming Events</Text>
              <Pressable onPress={() => router.push('/(tabs)/events')}>
                <Text style={styles.sectionCardLink}>View all</Text>
              </Pressable>
            </View>
            <View style={styles.eventsCalendarBody}>
              <UpcomingEventsCalendar markedDateKeys={calendarMarkedDateKeys} agenda={calendarAgenda} />
            </View>
          </View>

          {forYouLoading ? (
            <ActivityIndicator color={colors.accent} style={[isDesktop && styles.eventsFavoritesCardDesktop]} />
          ) : favorites.length === 0 ? (
            <EmptyState
              text="Nothing favorited yet — tap the heart on a family, event, product, podcast, or article, and it'll show up here."
              style={[isDesktop && styles.eventsFavoritesCardDesktop]}
            />
          ) : (
            // Distinct from every other section on this screen on purpose —
            // a tinted band with its own header, and a horizontal-scrolling
            // row instead of the wrap-grid everyone else uses, so this reads
            // as "everything you've favorited" at a glance rather than just
            // another list. Shows every favorite (there are only ever a
            // handful), so no expand/collapse toggle is needed here the way
            // the grids below need one.
            <View style={[styles.sectionCard, styles.favoritesBand, isDesktop && styles.eventsFavoritesCardDesktop]}>
              <View style={styles.favoritesHeader}>
                <View style={styles.sectionCardIconWrap}>
                  <Ionicons name="heart" size={13} color={colors.accent} />
                </View>
                <Text style={styles.sectionCardTitle}>Favorites</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favoritesScroll}
              >
                {favorites.map((h) => (
                  <SquareCard
                    key={h.key}
                    title={h.title}
                    subtitle={h.subtitle}
                    image={h.image}
                    pairImages={h.pairImages}
                    icon={h.icon}
                    badge={h.badge}
                    badgeVariant={h.badgeVariant}
                    matchScore={h.matchScore}
                    personFallback={h.personFallback}
                    favorited={h.favorited}
                    onToggleFavorite={h.onToggleFavorite}
                    size={isDesktop ? cardSize : undefined}
                    onPress={h.onPress}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <SectionHeader
          title="Families like you"
          {...viewAllAction(mergedFamilies.length, perRow, () => router.push('/(tabs)/families'))}
        />
        {familiesError ? (
          <EmptyState text={`Couldn’t load families (${familiesError}).`} />
        ) : familiesLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : mergedFamilies.length === 0 ? (
          <EmptyState text="No other families onboarded yet — check back soon." />
        ) : (
          <View style={styles.grid}>
            {mergedFamilies.slice(0, perRow).map((family) => {
              const photoUrl = familyPhoto(family);
              return (
                <SquareCard
                  key={family.uid}
                  title={familyDisplayName(family)}
                  subtitle={familySubtitle(family)}
                  image={photoUrl ? { uri: photoUrl } : undefined}
                  favorited={favoriteFamilyUids.has(family.uid)}
                  // The heart only shows once a family is already favorited
                  // (so it can be un-favorited from here) — favoriting for
                  // the first time happens on the family's own profile.
                  onToggleFavorite={favoriteFamilyUids.has(family.uid) ? () => toggleFamilyFavorite(family) : undefined}
                  matchScore={family.matchScore}
                  personFallback
                  size={cardSize}
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
                size={cardSize}
                onPress={() => router.push(`/proposal/${proposal.id}`)}
              />
            ) : null}
            {shownEventContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community event'}
                icon="calendar-outline"
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={favoriteContributionIds.has(c.id) ? () => toggleContributionFavorite(c.id) : undefined}
                size={cardSize}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'event', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
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
                softFallback={!event.imageUrl}
                size={cardSize}
                onPress={() =>
                  router.push({
                    pathname: '/event/[id]',
                    params: {
                      id: String(event.id),
                      title: event.title,
                      source: event.source,
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
        {shownFavoritedProducts.length > 0 || shownProductContributions.length > 0 || shownProducts.length > 0 ? (
          <View style={styles.grid}>
            {shownFavoritedProducts.map((product) => (
              <SquareCard
                key={product.url}
                title={product.title}
                subtitle={productSubtitle(product)}
                image={product.imageUrl ? { uri: product.imageUrl } : undefined}
                favorited={favoriteProductUrls.has(product.url)}
                onToggleFavorite={() => toggleProductFavorite(product)}
                size={cardSize}
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
            {shownProductContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                image={c.fields.imageUrl ? { uri: c.fields.imageUrl } : undefined}
                icon={c.fields.imageUrl ? undefined : 'bag-outline'}
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={favoriteContributionIds.has(c.id) ? () => toggleContributionFavorite(c.id) : undefined}
                size={cardSize}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'product', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
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
                // Heart only shows once already favorited — see the
                // matching comment on the family card above.
                onToggleFavorite={favoriteProductUrls.has(product.url) ? () => toggleProductFavorite(product) : undefined}
                size={cardSize}
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
        {shownFavoritedPodcasts.length > 0 || shownPodcastContributions.length > 0 || shownPodcasts.length > 0 ? (
          <View style={styles.grid}>
            {shownFavoritedPodcasts.map((podcast) => (
              <SquareCard
                key={podcast.id}
                title={podcast.title || 'Untitled podcast'}
                subtitle={podcastSubtitle(podcast)}
                image={podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined}
                favorited={favoritePodcastIds.has(podcast.id)}
                onToggleFavorite={() => togglePodcastFavorite(podcast)}
                size={cardSize}
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
            {shownPodcastContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                icon="mic-outline"
                community
                contributedBy={c.contributedByName}
                contributorPhoto={contributorPhotos.get(c.contributedByUid)}
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={favoriteContributionIds.has(c.id) ? () => toggleContributionFavorite(c.id) : undefined}
                size={cardSize}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'podcast', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
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
                // Heart only shows once already favorited — see the
                // matching comment on the family card above.
                onToggleFavorite={favoritePodcastIds.has(podcast.id) ? () => togglePodcastFavorite(podcast) : undefined}
                size={cardSize}
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
          title="Resources"
          {...viewAllAction(
            (sortedArticles?.length ?? 0) + articleContributions.length,
            ARTICLE_PAGE_SIZE,
            () => router.push('/(tabs)/articles')
          )}
        />
        {articlesError ? <EmptyState text={`Couldn’t load articles (${articlesError}).`} /> : null}
        {sortedArticles === null && !articlesError ? <ActivityIndicator color={colors.accent} /> : null}
        {shownFavoritedArticles.length > 0 || shownArticleContributions.length > 0 || shownArticles.length > 0 ? (
          <>
            {shownFavoritedArticles.map((article) => (
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
            {shownArticleContributions.map((c) => (
              <ListRow
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                subtitle={resourceSubtypeOf(c) === 'referral' ? c.fields.specialty : undefined}
                icon={RESOURCE_SUBTYPE_SCHEMAS[resourceSubtypeOf(c)].icon}
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={favoriteContributionIds.has(c.id) ? () => toggleContributionFavorite(c.id) : undefined}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'article', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
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
                // Heart only shows once already favorited — see the
                // matching comment on the family card above.
                onToggleFavorite={favoriteResourceUrls.has(article.url) ? () => toggleArticleFavorite(article) : undefined}
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
    // No extra inset — flush with SectionHeader's own edges (plain content
    // padding, no extra padding of its own) so a section's title, its
    // "View all" link, and its own card row all share the same left/right
    // edges. computeGridLayout sizes each card to exactly fill this width,
    // so the last card's right edge lands directly under "View all."
  },
  // A white, bordered card floating on the page's grey background — reads
  // as "its own module" through shape and elevation rather than a filled
  // color. Generic/reusable: the playdate callout, the Upcoming Events
  // calendar, and the Favorites band all share this same shell.
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    paddingBottom: 0,
  },
  sectionCardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  sectionCardLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  eventsCalendarBody: {
    padding: 16,
  },
  // On mobile the two cards stack full-width, each keeping its own
  // sectionCard margin — this wrapper is layout-neutral there. On
  // desktop they sit side by side instead, each taking half the row, so
  // the row itself takes over the outer margin (see
  // eventsFavoritesCardDesktop zeroing each card's own).
  eventsFavoritesRow: {},
  eventsFavoritesRowDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  // Only meaningful on desktop (see eventsFavoritesRowDesktop) — the row's
  // own marginTop/marginBottom above replace each card's individual
  // margins there, so both sides line up instead of stacking their own.
  eventsFavoritesCardDesktop: {
    flex: 1,
    marginTop: 0,
    marginBottom: 0,
  },
  // Favorites keeps its own asymmetric padding (flush left, open right) —
  // needed so its horizontal-scroll row can bleed its content to the
  // card's own right edge (the screen's, on mobile; the column's, on
  // desktop) instead of stopping at an inset.
  favoritesBand: {
    marginTop: 0,
    paddingVertical: 16,
    paddingLeft: 16,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingRight: 16,
  },
  favoritesScroll: {
    gap: 10,
    paddingRight: 16,
  },
  playdateLoading: {
    marginTop: 20,
    marginBottom: 16,
  },
  // Same white-card shell as sectionCard above (not reused directly since
  // this one needs its own marginBottom/padding rhythm to match the
  // callout's existing internal spacing) — both the confirmed and
  // Suggested Playdate states share this.
  playdateCallout: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // On desktop, the info column doesn't come close to using the card's
  // full width — rather than leave that as bare white space, the CTAs
  // move into their own column alongside it instead of stacking full-width
  // underneath.
  playdateCalloutDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 24,
  },
  playdateCalloutMain: {
    flex: 1,
  },
  playdateCalloutActions: {
    justifyContent: 'flex-end',
  },
  playdateCalloutActionsDesktop: {
    width: 260,
    justifyContent: 'center',
  },
  playdateCalloutHeader: {
    marginBottom: 16,
  },
  pdEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pdEyebrowIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playdateCalloutEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  // Grouped with the CTAs in playdateCalloutActions rather than up in the
  // header — it used to float alone to the left of the buttons once they
  // moved into their own column on desktop, disconnected from everything
  // else in that column. Right-aligned (flex-end) to sit flush with the
  // CTAs' own right edge rather than hanging off their left. Bare
  // background/text color live on the *Confirmed/*Suggested variants below
  // so the same shell serves both states.
  playdateCalloutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  playdateCalloutBadgeConfirmed: {
    backgroundColor: colors.positiveMuted,
  },
  playdateCalloutBadgeSuggested: {
    backgroundColor: colors.accentMuted,
  },
  playdateCalloutBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  playdateCalloutBadgeTextConfirmed: {
    color: colors.positive,
  },
  playdateCalloutBadgeTextSuggested: {
    color: colors.accent,
  },
  playdateCalloutTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  // The two families' photos, overlapping (same idiom as SquareCard's
  // pairImages thumbnail), plus both names/kids to the right — no boxed
  // container or match icon needed here, the photos themselves are the
  // visual.
  playdateCalloutFamiliesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  playdateCalloutPhotos: {
    width: 90,
    height: 64,
  },
  // Wider/taller than playdateCalloutPhotos above — the Suggested state
  // tucks a third, smaller provider avatar into the bottom-right seam,
  // which needs a bit more room than the plain two-avatar pair.
  pdPhotos: {
    width: 100,
    height: 78,
  },
  playdateCalloutAvatar: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  playdateCalloutAvatarBack: {
    left: 0,
  },
  playdateCalloutAvatarFront: {
    left: 26,
  },
  pdProviderWrap: {
    position: 'absolute',
    left: 64,
    top: 40,
    width: 34,
    height: 34,
  },
  pdProvider: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  pdProviderBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playdateCalloutFamilyNames: {
    flex: 1,
  },
  playdateCalloutFamilyName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  playdateCalloutFamilyKids: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
  },
  pdMatchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  pdMatchPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.accent,
  },
  playdateCalloutInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  playdateCalloutInfoText: {
    fontSize: 14,
    color: colors.text,
  },
  playdateCalloutSitterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  playdateCalloutSitterPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  playdateCalloutSitterInfo: {
    flex: 1,
  },
  playdateCalloutSitterName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  playdateCalloutSitterMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  playdateCalloutSitterCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 11,
    marginBottom: 14,
  },
  playdateCalloutSitterCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  playdateCalloutCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 13,
  },
  playdateCalloutCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
});
