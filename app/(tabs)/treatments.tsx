import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { colors } from '../../theme/colors';

export default function Treatments() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Treatments." />

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Active therapies" action="Add" />
        <EmptyState text="No therapies added yet." />

        <SectionHeader title="FDA approved & established" action="See all" />
        <ListRow title="Applied Behavior Analysis (ABA)" subtitle="ADHD, Autism · Evidence-based, widely covered" />
        <ListRow title="Speech & Language Therapy" subtitle="Autism, Dyslexia · Clinically established" />

        <SectionHeader title="Exploratory treatments" action="See all" />
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>
            These approaches have limited or emerging clinical evidence. Always consult your provider.
          </Text>
        </View>
        <EmptyState text="No exploratory treatments listed yet." />
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
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.warningMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
});
