import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';

export default function Events() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Events & playdates." />

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Your playdates" action="See all" />
        <ListRow
          title="Playground meetup"
          subtitle="Sat, Aug 16 · Nakamura Family"
          badge="Confirmed"
          onPress={() => router.push('/playdate/1')}
        />
        <ListRow title="Museum morning" subtitle="Sun, Aug 17 · Osei Family" badge="Unconfirmed" />

        <SectionHeader title="Events you're going to" />
        <ListRow title="Parent's Night Out" subtitle="RISE · 350 Jay St, Brooklyn" badge="31 going" />
        <ListRow title="Mom's Night Out" subtitle="South School · Park Slope" badge="Confirmed" />
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
});
