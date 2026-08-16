import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useMessagesBadge } from '../contexts/MessagesContext';
import { colors } from '../theme/colors';
import { SettingsMenu } from './SettingsMenu';

export function ScreenHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const { hasUnread } = useMessagesBadge();
  return (
    <View style={styles.row}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.icons}>
        <Pressable onPress={() => router.push('/messages')} hitSlop={8} style={styles.messageIcon}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
          {hasUnread ? <View style={styles.badge} /> : null}
        </Pressable>
        <SettingsMenu />
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
  messageIcon: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
