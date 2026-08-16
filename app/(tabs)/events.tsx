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
import { eventSubtitle, fetchNearbyEvents, NearbyEvent } from '../../lib/events';
import { familyPhoto, fetchFamiliesByUids } from '../../lib/families';
import { fetchLatestProposal, PlaydateProposal } from '../../lib/playdateProposals';
import { colors } from '../../theme/colors';

const ALL = 'All';
const VIRTUAL = 'Virtual';
const IN_PERSON = 'In-person';

export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlaydateProposal | null>(null);
  const [proposalFamilyPhotos, setProposalFamilyPhotos] = useState<[string | null, string | null] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(ALL);

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

  const filteredEvents = useMemo(() => {
    if (!events) return null;
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter === VIRTUAL && !e.virtual) return false;
      if (filter === IN_PERSON && e.virtual) return false;
      if (filter !== ALL && filter !== VIRTUAL && filter !== IN_PERSON && !e.categories.includes(filter)) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, query, filter]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Events." />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHero
          icon="calendar-outline"
          title="Meetups near you"
          description="In-person events within driving distance, plus virtual ones, from The Autism Community in Action (TACA)."
        />
        {error ? (
          <EmptyState text={`Couldn’t load events (${error}).`} />
        ) : events === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : events.length === 0 && !proposal ? (
          <EmptyState text="No upcoming events found — check back soon." />
        ) : (
          <>
            {events.length > 0 ? (
              <>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search events" />
                {filterOptions.length > 3 ? (
                  <FilterChips options={filterOptions} selected={filter} onSelect={setFilter} />
                ) : null}
              </>
            ) : null}
            {filteredEvents && filteredEvents.length === 0 && !proposal ? (
              <EmptyState text="No events match that search." />
            ) : (
              <View style={styles.grid}>
                {proposal ? (
                  <SquareCard
                    key={`proposal-${proposal.id}`}
                    title={proposal.dateLabel}
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
                {filteredEvents?.map((event) => (
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
