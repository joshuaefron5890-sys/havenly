import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

export default function PlaydateDetail() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Pressable style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>Confirmed</Text>
          </View>
        </View>
        <Text style={styles.title}>Playground meetup</Text>
        <Text style={styles.subtitle}>Sat, Aug 16 · 10:00 – 11:30 AM</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>FAMILIES</Text>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Your Family</Text>
            <View style={styles.acceptedBadge}>
              <Text style={styles.acceptedText}>Accepted</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>The Nakamura Family</Text>
            <View style={styles.acceptedBadge}>
              <Text style={styles.acceptedText}>Accepted</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardLabel}>MATCH SCORE</Text>
            <Text style={styles.matchScore}>94% match</Text>
          </View>
          <View style={styles.tags}>
            {['Playground', 'Drawing', 'Nature Walks', 'Music'].map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
          <View style={styles.whyBox}>
            <Text style={styles.whyText}>
              <Text style={styles.whyBold}>Why this match: </Text>
              Hana and Mia both love the big slide — and you're both free Saturday morning.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>LOCATION</Text>
          <Text style={styles.rowTitle}>Prospect Park Playground</Text>
          <Text style={styles.rowSubtitle}>Prospect Park, Brooklyn, NY 11215</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SUPERVISION</Text>
          <View style={styles.supervisionRow}>
            <View style={[styles.supervisionOption, styles.supervisionSelected]}>
              <Text style={styles.supervisionSelectedText}>Independent</Text>
            </View>
            <View style={styles.supervisionOption}>
              <Text style={styles.rowTitle}>Supervised</Text>
            </View>
          </View>
          <Text style={styles.rowSubtitle}>
            Both families manage the playdate on their own. You can add a chaperone at any time before the
            playdate.
          </Text>
          <Pressable style={styles.chaperoneButton}>
            <Text style={styles.chaperoneText}>Request a chaperone</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CONTACT</Text>
          <Text style={styles.rowTitle}>Yuki</Text>
          <View style={styles.contactButtons}>
            <Pressable style={styles.whatsapp}>
              <Text style={styles.whatsappText}>WhatsApp</Text>
            </Pressable>
            <Pressable style={styles.text}>
              <Text style={styles.textText}>Text</Text>
            </Pressable>
          </View>
        </View>
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
  hero: {
    height: 160,
    borderRadius: 20,
    backgroundColor: colors.accentMuted,
    marginBottom: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  confirmedBadge: {
    backgroundColor: colors.positiveMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  confirmedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.positive,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  acceptedBadge: {
    backgroundColor: colors.positiveMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  acceptedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.positive,
  },
  matchScore: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  whyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  whyText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  whyBold: {
    fontWeight: '700',
    color: colors.accent,
  },
  supervisionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  supervisionOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  supervisionSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  supervisionSelectedText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
  chaperoneButton: {
    backgroundColor: colors.accentMuted,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  chaperoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  whatsapp: {
    flex: 1,
    backgroundColor: '#25D366',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  whatsappText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  text: {
    flex: 1,
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  textText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
});
