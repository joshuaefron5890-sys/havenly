import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from './Chip';

// Some option sources (e.g. the events feed's categories, derived from raw
// WordPress slugs like "support_group") come through all-lowercase; others
// (neurodivergence tags like "ADHD", "Autism") are already correctly cased.
// Capitalizes only words that are entirely lowercase, so an acronym or a
// tag that's already properly cased is never touched — display-only, the
// underlying option string (used for selection/matching) is untouched.
function displayLabel(option: string): string {
  return option
    .split(' ')
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// A horizontally-scrolling single-select chip row — the same "All" +
// dynamically-derived-options pattern reused across each bottom-nav
// sub-page's metadata filter (tags, categories, etc.).
export function FilterChips({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => (
        <Chip
          key={option}
          label={displayLabel(option)}
          selected={option === selected}
          onPress={() => onSelect(option)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
});
