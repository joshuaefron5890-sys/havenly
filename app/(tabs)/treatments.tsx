import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
        <ListRow title="Occupational Therapy (OT)" subtitle="1x per week · Park Slope OT Center" />
        <ListRow title="Behavioral Therapy" subtitle="2x per month · Dr. Lena Park, Park Slope" />

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
        <ListRow title="Example exploratory treatment" subtitle="Limited evidence · consult your provider" />
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
