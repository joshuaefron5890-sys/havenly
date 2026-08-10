import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

const TABS = ['My List · 6', 'Discover'] as const;

const SUGGESTED_FAMILIES = [
  { name: 'Yuki', subtitle: 'Hana, 5 · Leo, 2 · 0.4 mi', match: 94, image: images.familyYuki },
  { name: 'Abena', subtitle: 'Kwame, 3 · Ama, 3 · 0.9 mi', match: 88, image: images.familyAbena },
];

const SUGGESTED_PLAYDATES = [
  { title: 'Sensory Storytime', subtitle: 'Sat, Aug 16 · Brooklyn Public Library', reason: "Low-stimulation and structured — great for Mia's focus", image: images.playdateSensoryStorytime },
  { title: 'Outdoor Art Morning', subtitle: 'Sun, Aug 17 · Prospect Park', reason: 'Open-air creativity — matches drawing love', image: images.playdateOutdoorArt },
];

export default function ForYou() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const isDiscover = activeTab === 'Discover';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="For you, Sarah." showSettings={isDiscover} />

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
            {SUGGESTED_FAMILIES.map((family) => (
              <ListRow key={family.name} title={family.name} subtitle={family.subtitle} badge={`${family.match}%`} image={family.image} />
            ))}

            <SectionHeader title="Suggested playdates" action="See more" />
            {SUGGESTED_PLAYDATES.map((playdate) => (
              <ListRow key={playdate.title} title={playdate.title} subtitle={`${playdate.subtitle} — ${playdate.reason}`} image={playdate.image} />
            ))}

            <SectionHeader title="For Mia — products" action="View all" />
            <ListRow title="Harkla Weighted Blanket" subtitle="$89" image={images.productWeightedBlanket} />
            <ListRow title="Noise-cancelling headphones" subtitle="$45" image={images.productHeadphones} />
          </>
        ) : (
          <>
            <SectionHeader title="Families" action="Browse all" />
            <ListRow title="Yuki" subtitle="Hana, 5 · Leo, 2 · 0.4 mi" image={images.familyYuki} />

            <SectionHeader title="Playdates" action="View in Events" />
            <ListRow
              title="Playground meetup"
              subtitle="Sat, Aug 16 · Nakamura Family"
              badge="Confirmed"
              image={images.playdatePlayground}
              onPress={() => router.push('/playdate/1')}
            />

            <SectionHeader title="Products" />
            <ListRow title="Harkla Weighted Blanket" subtitle="$89" image={images.productWeightedBlanket} />
            <ListRow title="Rubik's Cube 3×3" subtitle="$12" image={images.productRubiksCube} />

            <SectionHeader title="Seminars" />
            <ListRow title="ADHD & Playdates: What Actually Helps" subtitle="Sep 14 · Zoom" image={images.seminarAdhdPlaydates} />

            <SectionHeader title="Podcasts" />
            <ListRow title="Coming soon" subtitle="More content on the way" />
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
