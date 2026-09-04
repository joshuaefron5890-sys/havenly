import { StyleProp, StyleSheet, TextStyle } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

export function EmptyState({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.text, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
});
