import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.text}>{text}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
});
