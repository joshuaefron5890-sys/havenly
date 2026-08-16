import { StyleSheet } from 'react-native';
import { Text } from './AppText';
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
