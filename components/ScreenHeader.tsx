import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function ScreenHeader({
  eyebrow,
  title,
  showSettings,
}: {
  eyebrow?: string;
  title: string;
  showSettings?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.icons}>
        <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
        <View style={styles.avatar} />
        {showSettings ? <Ionicons name="settings-outline" size={22} color={colors.text} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 13,
    color: colors.textMuted,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
  },
});
