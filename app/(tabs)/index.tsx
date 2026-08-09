import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';

const TABS = ['My List · 6', 'Discover'] as const;

export default function ForYou() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(TABS[0]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="For you, Sarah." />

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
        <SectionHeader title="Families" action="Browse all" />
        <ListRow title="Yuki" subtitle="Hana, 5 · Leo, 2 · 0.4 mi" />

        <SectionHeader title="Playdates" action="View in Events" />
        <ListRow title="Playground meetup" subtitle="Sat, Aug 16 · Nakamura Family" badge="Confirmed" />

        <SectionHeader title="Products" />
        <ListRow title="Harkla Weighted Blanket" subtitle="$89" />
        <ListRow title="Rubik's Cube 3×3" subtitle="$12" />

        <SectionHeader title="Seminars" />
        <ListRow title="ADHD & Playdates: What Actually Helps" subtitle="Sep 14 · Zoom" />

        <SectionHeader title="Podcasts" />
        <ListRow title="Coming soon" subtitle="More content on the way" />
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
