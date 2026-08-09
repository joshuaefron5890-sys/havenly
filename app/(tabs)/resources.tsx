import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';

export default function Resources() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Resources." />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.featured}>
          <Text style={styles.featuredBadge}>FEATURED</Text>
          <Text style={styles.featuredTitle}>The ND Parent's Guide to Inclusive Playdates</Text>
          <Text style={styles.featuredSubtitle}>Haven.ly · 10 min read</Text>
        </View>

        <SectionHeader title="Articles & guides" action="Browse library" />
        <ListRow title="5 Playdate Strategies for Kids with ADHD" subtitle="ADHD · 4 min · Understood.org" />
        <ListRow title="What to Tell Other Parents Before a Playdate" subtitle="Social skills · 6 min · Child Mind Institute" />

        <SectionHeader title="Downloads for you" />
        <ListRow title="Playdate Prep Card" subtitle="Share with the other parent before you meet" />
        <ListRow title="ADHD Social Skills Checklist" subtitle="Track social milestones month by month" />
        <ListRow title="Mia's Calm-Down Toolkit" subtitle="Quick-reference card for sensory breaks" />
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
  featured: {
    backgroundColor: colors.text,
    borderRadius: 20,
    padding: 16,
    minHeight: 140,
    justifyContent: 'flex-end',
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  featuredTitle: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '700',
  },
  featuredSubtitle: {
    color: colors.surface,
    opacity: 0.8,
    fontSize: 12,
    marginTop: 4,
  },
});
