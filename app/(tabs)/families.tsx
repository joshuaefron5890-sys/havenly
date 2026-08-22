import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHero } from '../../components/SectionHero';
import { SquareCard } from '../../components/SquareCard';
import { useAuth } from '../../contexts/AuthContext';
import {
  addFavoriteFamily,
  getFavoriteFamilyUids,
  removeFavoriteFamily,
} from '../../lib/favorites';
import { familyDisplayName, familyPhoto, familySubtitle, fetchSuggestedFamilies, SuggestedFamily } from '../../lib/families';
import { colors } from '../../theme/colors';

const PAGE_BATCH = 12;
const ALL = 'All';

export default function Families() {
  const { user, familyUid } = useAuth();
  const [families, setFamilies] = useState<SuggestedFamily[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteUids, setFavoriteUids] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState(ALL);
  // The server already returns the full list (see getSuggestedFamilies) —
  // this just reveals more of what's already been fetched as the user
  // scrolls, same pattern as the Products/Podcasts tabs.
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      fetchSuggestedFamilies()
        .then((result) => {
          if (!cancelled) setFamilies(result);
        })
        .catch((err: any) => {
          if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
        });
      getFavoriteFamilyUids(familyUid ?? user.uid).then((ids) => {
        if (!cancelled) setFavoriteUids(new Set(ids));
      });
      return () => {
        cancelled = true;
      };
    }, [user, familyUid])
  );

  // Schools actually attended by any of these families' kids (neurodivergent
  // child or sibling — see functions/index.js's publicSchoolsOf), not a
  // fixed list — matches whichever schools are actually in this cluster's
  // families right now.
  const schoolOptions = useMemo(() => {
    if (!families) return [ALL];
    const schools = new Set<string>();
    families.forEach((f) => f.schools.forEach((s) => schools.add(s)));
    return [ALL, ...[...schools].sort()];
  }, [families]);

  const filtered = useMemo(() => {
    if (!families) return null;
    const q = query.trim().toLowerCase();
    return families.filter((f) => {
      if (schoolFilter !== ALL && !f.schools.includes(schoolFilter)) return false;
      if (q && !familyDisplayName(f).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [families, query, schoolFilter]);

  // Favorited families lead, same as every other tab this session —
  // always shown in full, unpaginated; everything else is what scrolls.
  const favoritedFamilies = filtered?.filter((f) => favoriteUids.has(f.uid)) ?? null;
  const restFamilies = filtered?.filter((f) => !favoriteUids.has(f.uid)) ?? null;
  const visibleRestFamilies = restFamilies?.slice(0, visibleCount);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom < 400) {
      setVisibleCount((prev) => Math.min(prev + PAGE_BATCH, restFamilies?.length ?? prev));
    }
  };

  const toggleFavorite = async (family: SuggestedFamily) => {
    const wasFavorited = favoriteUids.has(family.uid);
    setFavoriteUids((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(family.uid) : next.add(family.uid);
      return next;
    });
    try {
      await (wasFavorited ? removeFavoriteFamily(family.uid) : addFavoriteFamily(family.uid));
    } catch {
      setFavoriteUids((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(family.uid) : next.delete(family.uid);
        return next;
      });
    }
  };

  const hasContent = (filtered?.length ?? 0) > 0;
  const doneLoading = families !== null || Boolean(error);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" />
      <ScrollView contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={200}>
        <SectionHero
          imageUrl="https://images.unsplash.com/photo-1542037104857-ffbb0b9155fb?q=80&w=1654&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          title="Families to meet"
          description="Every family on Haven.ly, matched by shared neurodivergence, interests, and schedules — not just proximity."
        />

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search families" />
        {schoolOptions.length > 2 ? (
          <FilterChips options={schoolOptions} selected={schoolFilter} onSelect={setSchoolFilter} />
        ) : null}

        {error ? <EmptyState text={`Couldn’t load families (${error}).`} /> : null}
        {families === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {hasContent ? (
          <View style={styles.grid}>
            {favoritedFamilies?.map((family) => (
              <SquareCard
                key={family.uid}
                title={familyDisplayName(family)}
                subtitle={familySubtitle(family)}
                image={familyPhoto(family) ? { uri: familyPhoto(family)! } : undefined}
                favorited
                onToggleFavorite={() => toggleFavorite(family)}
                matchScore={family.matchScore}
                personFallback
                onPress={() => router.push(`/family/${family.uid}`)}
              />
            ))}
            {visibleRestFamilies?.map((family) => (
              <SquareCard
                key={family.uid}
                title={familyDisplayName(family)}
                subtitle={familySubtitle(family)}
                image={familyPhoto(family) ? { uri: familyPhoto(family)! } : undefined}
                favorited={favoriteUids.has(family.uid)}
                onToggleFavorite={favoriteUids.has(family.uid) ? () => toggleFavorite(family) : undefined}
                matchScore={family.matchScore}
                personFallback
                onPress={() => router.push(`/family/${family.uid}`)}
              />
            ))}
          </View>
        ) : doneLoading ? (
          <EmptyState text="No families match that search." />
        ) : null}
        {(visibleRestFamilies?.length ?? 0) < (restFamilies?.length ?? 0) ? (
          <ActivityIndicator color={colors.accent} style={styles.loadingMore} />
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
  spinner: {
    marginVertical: 12,
  },
  loadingMore: {
    marginTop: 16,
  },
});
