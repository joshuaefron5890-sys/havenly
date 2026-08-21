import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { eventSubtitle, fetchNearbyEvents, NearbyEvent } from '../../lib/events';
import { familyPhoto, fetchFamiliesByUids } from '../../lib/families';
import { addFavoriteContribution, getFavoriteContributionIds, removeFavoriteContribution } from '../../lib/favorites';
import { fetchLatestProposal, PlaydateProposal, proposalStartLabel } from '../../lib/playdateProposals';
import { colors } from '../../theme/colors';

const ALL = 'All';
const VIRTUAL = 'Virtual';
const IN_PERSON = 'In-person';
// Community-contributed events don't carry a `source` the way a curated
// NearbyEvent does (TACA, a regional center, etc.) — this is their stand-in
// so they can appear as one more option in the same filter row.
const COMMUNITY_SOURCE = 'Community';
const SCHEMA = CONTRIBUTION_SCHEMAS.event;

export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlaydateProposal | null>(null);
  const [proposalFamilyPhotos, setProposalFamilyPhotos] = useState<[string | null, string | null] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributeVisible, setContributeVisible] = useState(false);
  const [favoriteContributionIds, setFavoriteContributionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchNearbyEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
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
      fetchLatestProposal().then((result) => {
        if (!cancelled) setProposal(result);
      });
      getFavoriteContributionIds(user.uid).then((ids) => {
        if (!cancelled) setFavoriteContributionIds(new Set(ids));
      });
      fetchContributions('event').then((result) => {
        if (!cancelled) setContributions(result);
      });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

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

  // "Virtual"/"In-person" lead the filter row (a distinction that matters
  // for every event), followed by whatever categories actually turned up.
  const filterOptions = useMemo(() => {
    if (!events) return [ALL];
    const categories = new Set<string>();
    events.forEach((e) => e.categories.forEach((c) => categories.add(c)));
    return [ALL, VIRTUAL, IN_PERSON, ...[...categories].sort()];
  }, [events]);

  // Sources actually present in the current feed, plus "Community" tacked
  // on at the end when there's at least one community-submitted event to
  // filter to — derived rather than a fixed list, so a new curated source
  // just shows up here automatically.
  const sourceOptions = useMemo(() => {
    if (!events) return [ALL];
    const sources = new Set<string>();
    events.forEach((e) => sources.add(e.source));
    const options = [ALL, ...[...sources].sort()];
    if (contributions.length > 0) options.push(COMMUNITY_SOURCE);
    return options;
  }, [events, contributions]);

  const filteredEvents = useMemo(() => {
    if (!events) return null;
    if (sourceFilter === COMMUNITY_SOURCE) return [];
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter === VIRTUAL && !e.virtual) return false;
      if (filter === IN_PERSON && e.virtual) return false;
      if (filter !== ALL && filter !== VIRTUAL && filter !== IN_PERSON && !e.categories.includes(filter)) return false;
      if (sourceFilter !== ALL && e.source !== sourceFilter) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, query, filter, sourceFilter]);

  const filteredContributions = useMemo(() => {
    if (sourceFilter !== ALL && sourceFilter !== COMMUNITY_SOURCE) return [];
    const q = query.trim().toLowerCase();
    if (!q) return contributions;
    return contributions.filter((c) => (c.fields.title ?? '').toLowerCase().includes(q));
  }, [contributions, query, sourceFilter]);

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
    await createContribution('event', values, name);
    const result = await fetchContributions('event');
    setContributions(result);
  };

  // Community contributions are fetched and rendered independently of the
  // real (TACA-sourced) events feed, and must stay that way — they used to
  // live inside the same branch as the events error/loading state, so a
  // contributor's own just-submitted event would silently vanish behind
  // "Couldn't load events" whenever that unrelated feed had trouble.
  const hasContent = Boolean(proposal) || (filteredEvents?.length ?? 0) > 0 || filteredContributions.length > 0;
  const doneLoadingEvents = events !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          imageUrl="https://plus.unsplash.com/premium_photo-1663108204317-c76d8c7748d9?q=80&w=1768&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Events for you"
          description="Scheduled playdates, In-person meetups, virtual events and more. View the details and sync to your calendar."
        />
        <Pressable style={styles.contributeButton} onPress={() => setContributeVisible(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.contributeButtonText}>Contribute an event</Text>
        </Pressable>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search events" />
        {filterOptions.length > 3 ? <FilterChips options={filterOptions} selected={filter} onSelect={setFilter} /> : null}
        {sourceOptions.length > 2 ? (
          <>
            <Text style={styles.sourceLabel}>SOURCE</Text>
            <FilterChips options={sourceOptions} selected={sourceFilter} onSelect={setSourceFilter} />
          </>
        ) : null}

        {error ? <EmptyState text={`Couldn’t load nearby events (${error}). Community-submitted ones still show below.`} /> : null}
        {events === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <View style={styles.grid}>
            {proposal ? (
              <SquareCard
                key={`proposal-${proposal.id}`}
                title={proposalStartLabel(proposal)}
                subtitle={proposal.venue}
                icon="calendar"
                pairImages={
                  proposalFamilyPhotos
                    ? [
                        proposalFamilyPhotos[0] ? { uri: proposalFamilyPhotos[0] } : undefined,
                        proposalFamilyPhotos[1] ? { uri: proposalFamilyPhotos[1] } : undefined,
                      ]
                    : undefined
                }
                badge="Proposed"
                onPress={() => router.push(`/proposal/${proposal.id}`)}
              />
            ) : null}
            {filteredContributions.map((c) => (
              <SquareCard
                key={c.id}
                title={c.fields.title ?? 'Community event'}
                icon="calendar-outline"
                community
                favorited={favoriteContributionIds.has(c.id)}
                onToggleFavorite={() => toggleContributionFavorite(c.id)}
                onPress={() =>
                  router.push({
                    pathname: '/contribution/[id]',
                    params: { id: c.id, type: 'event', fieldsJson: JSON.stringify(c.fields), contributedByName: c.contributedByName, contributedByUid: c.contributedByUid },
                  })
                }
              />
            ))}
            {filteredEvents?.map((event) => (
              <SquareCard
                key={event.id}
                title={event.title}
                subtitle={eventSubtitle(event)}
                image={event.imageUrl ? { uri: event.imageUrl } : undefined}
                icon={event.imageUrl ? undefined : 'calendar-outline'}
                softFallback={!event.imageUrl}
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
        ) : doneLoadingEvents ? (
          <EmptyState text="No events match that search." />
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spinner: {
    marginVertical: 12,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
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
