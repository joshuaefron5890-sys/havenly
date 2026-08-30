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
import { DESKTOP_CARD_WIDTH, SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { Contribution, CONTRIBUTION_SCHEMAS, createContribution, fetchContributions } from '../../lib/contributions';
import { fetchContributorPhotos } from '../../lib/families';
import { useIsDesktop } from '../../lib/responsive';
import {
  addFavoriteContribution,
  addFavoritePodcast,
  getFavoriteContributionIds,
  getFavoritePodcastIds,
  removeFavoriteContribution,
  removeFavoritePodcast,
} from '../../lib/favorites';
import { contributionKey, hideContent, podcastKey } from '../../lib/moderation';
import { fetchPodcastSuggestions, podcastSubtitle, PodcastSuggestion } from '../../lib/podcasts';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

const ALL = 'All';
const SCHEMA = CONTRIBUTION_SCHEMAS.podcast;
const PAGE_BATCH = 12;

export default function Podcasts() {
  const { user, familyUid, clusterId } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const isDesktop = useIsDesktop();
  const [podcasts, setPodcasts] = useState<PodcastSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(ALL);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributeVisible, setContributeVisible] = useState(false);
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());
  const [contributorPhotos, setContributorPhotos] = useState<Map<string, string | null>>(new Map());
  // The server already returns the full deduped/ranked list (see
  // getPodcastSuggestions) — this just reveals more of what's already been
  // fetched as the user scrolls, rather than a real paginated fetch.
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPodcastSuggestions()
      .then((result) => {
        if (!cancelled) setPodcasts(result);
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
      getFavoritePodcastIds(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoriteIds(new Set(ids));
      });
      getFavoriteContributionIds(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoriteContributionIds(new Set(ids));
      });
      fetchContributions('podcast').then((result) => {
        if (!cancelled) setContributions(result);
        if (!cancelled) fetchContributorPhotos(result).then((photos) => !cancelled && setContributorPhotos(photos));
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const sorted = podcasts;

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
      if (q && !p.title.toLowerCase().includes(q) && !p.artist.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, query, tagFilter]);

  const favoritedPodcasts = filtered?.filter((p) => favoriteIds.has(p.id)) ?? null;
  const restPodcasts = filtered?.filter((p) => !favoriteIds.has(p.id)) ?? null;
  const visibleRestPodcasts = restPodcasts?.slice(0, visibleCount);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom < 400) {
      setVisibleCount((prev) => Math.min(prev + PAGE_BATCH, restPodcasts?.length ?? prev));
    }
  };

  const filteredContributions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contributions;
    return contributions.filter((c) => (c.fields.title ?? '').toLowerCase().includes(q));
  }, [contributions, query]);

  const toggleFavorite = async (podcast: PodcastSuggestion) => {
    const wasFavorited = favoriteIds.has(podcast.id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(podcast.id) : next.add(podcast.id);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoritePodcast(podcast.id) : addFavoritePodcast(podcast.id));
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(podcast.id) : next.delete(podcast.id);
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
  const deletePodcast = async (podcast: PodcastSuggestion) => {
    setPodcasts((prev) => prev?.filter((p) => p.id !== podcast.id) ?? prev);
    try {
      await hideContent(podcastKey(podcast.id), podcast.title || 'Untitled podcast');
    } catch (err: any) {
      showAlert('Couldn’t remove that podcast', err?.message ?? err?.code ?? 'Please try again.');
      setPodcasts((prev) => (prev ? [...prev, podcast] : prev));
    }
  };

  const deletePodcastContribution = async (c: Contribution) => {
    setContributions((prev) => prev.filter((x) => x.id !== c.id));
    try {
      await hideContent(contributionKey(c.id), c.fields.title ?? 'Community pick');
    } catch (err: any) {
      showAlert('Couldn’t remove that podcast', err?.message ?? err?.code ?? 'Please try again.');
      setContributions((prev) => [...prev, c]);
    }
  };

  const submitContribution = async (name: string, values: Record<string, string>) => {
    await createContribution('podcast', values, name);
    const result = await fetchContributions('podcast');
    setContributions(result);
  };

  // Community contributions must render regardless of the podcast-
  // suggestions fetch's own state — this used to live inside that fetch's
  // error/loading branch, so a contributor's own just-submitted podcast
  // would silently vanish behind "Couldn't load podcasts" whenever that
  // unrelated feed had trouble.
  const hasContent = (filtered?.length ?? 0) > 0 || filteredContributions.length > 0;
  const doneLoadingPodcasts = sorted !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={200}>
        <SectionHero
          imageUrl="https://plus.unsplash.com/premium_photo-1664200913631-3d9218be0316?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Podcasts worth a listen"
          description="Podcasts about neurodivergence, parenting, and everyday life, tailored for you and your child."
        />
        <Pressable style={styles.contributeButton} onPress={() => setContributeVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute a podcast</Text>
        </Pressable>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search podcasts" />
        {tagOptions.length > 2 ? <FilterChips options={tagOptions} selected={tagFilter} onSelect={setTagFilter} /> : null}

        {error ? <EmptyState text={`Couldn’t load podcast suggestions (${error}). Community picks still show below.`} /> : null}
        {sorted === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <View style={styles.grid}>
            {favoritedPodcasts?.map((podcast) => (
              <SquareCard
                key={podcast.id}
                title={podcast.title || 'Untitled podcast'}
                subtitle={podcastSubtitle(podcast)}
                image={podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined}
                favorited={favoriteIds.has(podcast.id)}
                onToggleFavorite={() => toggleFavorite(podcast)}
                onDelete={isAdmin ? () => deletePodcast(podcast) : undefined}
                size={isDesktop ? DESKTOP_CARD_WIDTH : undefined}
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
            {filteredContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community pick'}
                icon="mic-outline"
                community
                contributedBy={c.contributedByName}
                contributorPhoto={contributorPhotos.get(c.contributedByUid)}
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={() => toggleContributionFavorite(c.id)}
                onDelete={isAdmin ? () => deletePodcastContribution(c) : undefined}
                size={isDesktop ? DESKTOP_CARD_WIDTH : undefined}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'podcast', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
                  })
                }
              />
            ))}
            {visibleRestPodcasts?.map((podcast) => (
              <SquareCard
                key={podcast.id}
                title={podcast.title || 'Untitled podcast'}
                subtitle={podcastSubtitle(podcast)}
                image={podcast.artworkUrl ? { uri: podcast.artworkUrl } : undefined}
                favorited={favoriteIds.has(podcast.id)}
                onToggleFavorite={() => toggleFavorite(podcast)}
                onDelete={isAdmin ? () => deletePodcast(podcast) : undefined}
                size={isDesktop ? DESKTOP_CARD_WIDTH : undefined}
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
        ) : doneLoadingPodcasts ? (
          <EmptyState text="No podcasts match that search." />
        ) : null}
        {(visibleRestPodcasts?.length ?? 0) < (restPodcasts?.length ?? 0) ? (
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
