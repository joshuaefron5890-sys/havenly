import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from './Chip';

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
        <Chip key={option} label={option} selected={option === selected} onPress={() => onSelect(option)} />
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
