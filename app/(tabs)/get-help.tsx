import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

const FILTERS = ['All', 'Available Now', 'Sitters', 'Nannies', 'Behavioral'];

const HELPERS = [
  { id: '1', name: 'Marcus T.', role: 'BCBA · 7 yrs · 0.6 mi', rate: '$45/hr', rating: '4.9', reviews: 38, tags: ['Behavioral Support', 'Sitter'], image: images.helperMarcus },
  { id: '2', name: 'Available OT', role: 'OT · 5 yrs · 1.1 mi', rate: '$55/hr', rating: '4.8', reviews: 24, tags: ['Occupational Therapy', 'Sitter'], image: images.helperOt },
];

export default function GetHelp() {
  const [filter, setFilter] = useState(FILTERS[0]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Get Help." />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Licensed, vetted helpers for playdates and home sessions.</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, credential, specialty..."
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((option) => (
            <Pressable
              key={option}
              style={[styles.filterChip, filter === option && styles.filterChipActive]}
              onPress={() => setFilter(option)}
            >
              <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {HELPERS.map((helper) => (
          <Pressable key={helper.id} style={styles.card} onPress={() => router.push(`/helper/${helper.id}`)}>
            <Photo source={helper.image} style={styles.avatar} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardName}>{helper.name}</Text>
                <Text style={styles.cardRate}>{helper.rate}</Text>
              </View>
              <Text style={styles.cardRole}>{helper.role}</Text>
              <Text style={styles.cardRating}>
                {helper.rating} ★ · {helper.reviews} reviews
              </Text>
              <View style={styles.tags}>
                {helper.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
        ))}

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Unlock Haven.ly Premium</Text>
          <Text style={styles.premiumSubtitle}>4 more vetted helpers in your area</Text>
          <Text style={styles.premiumBullet}>✓ Full access to all vetted helpers & sitters</Text>
          <Text style={styles.premiumBullet}>✓ Direct booking for playdates & sessions</Text>
          <Text style={styles.premiumBullet}>✓ Priority chaperone matching</Text>
          <View style={styles.premiumFooter}>
            <View>
              <Text style={styles.premiumPrice}>$9.99/mo</Text>
              <Text style={styles.premiumCancel}>Cancel any time</Text>
            </View>
            <Pressable style={styles.unlockButton}>
              <Text style={styles.unlockText}>Unlock now</Text>
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
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  filterTextActive: {
    color: colors.surface,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentMuted,
  },
  cardBody: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  cardRate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  cardRole: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardRating: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  premiumCard: {
    backgroundColor: colors.text,
    borderRadius: 20,
    padding: 18,
    marginTop: 10,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.surface,
  },
  premiumSubtitle: {
    fontSize: 13,
    color: colors.surface,
    opacity: 0.8,
    marginBottom: 12,
  },
  premiumBullet: {
    fontSize: 13,
    color: colors.surface,
    marginBottom: 6,
  },
  premiumFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  premiumPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.surface,
  },
  premiumCancel: {
    fontSize: 12,
    color: colors.surface,
    opacity: 0.7,
  },
  unlockButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  unlockText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
});
