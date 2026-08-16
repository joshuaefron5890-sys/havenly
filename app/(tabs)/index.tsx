import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { useAuth } from '../../contexts/AuthContext';
import { getFavoriteFamilyUids } from '../../lib/favorites';
import {
  familyDisplayName,
  familyPhoto,
  familySubtitle,
  fetchFamiliesByUids,
  fetchSuggestedFamilies,
  SuggestedFamily,
} from '../../lib/families';
import { colors } from '../../theme/colors';

const TABS = ['My List', 'Discover'] as const;

export default function ForYou() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const isDiscover = activeTab === 'Discover';
  const { user } = useAuth();

  const [families, setFamilies] = useState<SuggestedFamily[] | null>(null);
  const [familiesError, setFamiliesError] = useState<string | null>(null);

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

  const [myFamilies, setMyFamilies] = useState<SuggestedFamily[] | null>(null);
  const [myFamiliesError, setMyFamiliesError] = useState<string | null>(null);

  // Re-fetches every time this screen regains focus (not just on mount) —
  // favoriting happens on the family detail screen, so coming back here
  // needs to pick up whatever changed there.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      setMyFamiliesError(null);
      getFavoriteFamilyUids(user.uid)
        .then((ids) => fetchFamiliesByUids(ids))
        .then((result) => {
          if (!cancelled) setMyFamilies(result);
        })
        .catch((err: any) => {
          if (!cancelled) setMyFamiliesError(err?.message ?? err?.code ?? 'unknown error');
        });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const firstName = user?.displayName?.split(' ')[0];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title={firstName ? `For you, ${firstName}.` : 'For you.'} />

      <View style={styles.toggle}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.toggleItem, activeTab === tab && styles.toggleItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.toggleText, activeTab === tab && styles.toggleTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isDiscover ? (
          <>
            <SectionHeader title="Suggested families" action="Browse all" />
            {familiesError ? (
              <EmptyState text={`Couldn’t load families (${familiesError}).`} />
            ) : families === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : families.length === 0 ? (
              <EmptyState text="No other families onboarded yet — check back soon." />
            ) : (
              families.map((family) => {
                const photoUrl = familyPhoto(family);
                return (
                  <ListRow
                    key={family.uid}
                    title={familyDisplayName(family)}
                    subtitle={familySubtitle(family)}
                    image={photoUrl ? { uri: photoUrl } : undefined}
                    onPress={() => router.push(`/family/${family.uid}`)}
                  />
                );
              })
            )}

            <SectionHeader title="Suggested playdates" action="See more" />
            <EmptyState text="No playdate suggestions yet — check back once you've connected with families." />

            <SectionHeader title="Products" action="View all" />
            <EmptyState text="No product recommendations yet." />
          </>
        ) : (
          <>
            <SectionHeader title="Families" action="Browse all" />
            {myFamiliesError ? (
              <EmptyState text={`Couldn’t load your families (${myFamiliesError}).`} />
            ) : myFamilies === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : myFamilies.length === 0 ? (
              <EmptyState text="No connected families yet — find some under Discover." />
            ) : (
              myFamilies.map((family) => {
                const photoUrl = familyPhoto(family);
                return (
                  <ListRow
                    key={family.uid}
                    title={familyDisplayName(family)}
                    subtitle={familySubtitle(family)}
                    image={photoUrl ? { uri: photoUrl } : undefined}
                    onPress={() => router.push(`/family/${family.uid}`)}
                  />
                );
              })
            )}

            <SectionHeader title="Playdates" action="View in Events" />
            <EmptyState text="No playdates yet." />

            <SectionHeader title="Products" />
            <EmptyState text="No product recommendations yet." />

            <SectionHeader title="Seminars" />
            <EmptyState text="No seminars yet." />

            <SectionHeader title="Podcasts" />
            <EmptyState text="No podcasts yet." />
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
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 999,
    marginHorizontal: 20,
    padding: 4,
    gap: 4,
  },
  toggleItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  toggleItemActive: {
    backgroundColor: colors.background,
  },
  toggleText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
});
