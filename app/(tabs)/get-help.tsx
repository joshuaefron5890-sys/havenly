import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../theme/colors';

const FILTERS = ['All', 'Available Now', 'Sitters', 'Nannies', 'Behavioral'];

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

        <EmptyState text="No helpers listed in your area yet." />

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Unlock Haven.ly Premium</Text>
          <Text style={styles.premiumSubtitle}>Priority access to vetted helpers in your area</Text>
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
