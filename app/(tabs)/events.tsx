import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import { eventSubtitle, fetchNearbyEvents, NearbyEvent } from '../../lib/events';
import { familyPhoto, fetchFamiliesByUids } from '../../lib/families';
import { fetchLatestProposal, PlaydateProposal } from '../../lib/playdateProposals';
import { colors } from '../../theme/colors';

export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlaydateProposal | null>(null);
  const [proposalFamilyPhotos, setProposalFamilyPhotos] = useState<[string | null, string | null] | null>(null);

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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Events." />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <EmptyState text={`Couldn’t load events (${error}).`} />
        ) : events === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : events.length === 0 && !proposal ? (
          <EmptyState text="No upcoming events found — check back soon." />
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
                    ? [proposalFamilyPhotos[0] ? { uri: proposalFamilyPhotos[0] } : undefined, proposalFamilyPhotos[1] ? { uri: proposalFamilyPhotos[1] } : undefined]
                    : undefined
                }
                badge="Proposed"
                onPress={() => router.push(`/proposal/${proposal.id}`)}
              />
            ) : null}
            {events.map((event) => (
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
