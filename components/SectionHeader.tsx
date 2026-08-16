import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{action}</Text>
          </Pressable>
        ) : (
          <Text style={styles.action}>{action}</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  action: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
});
