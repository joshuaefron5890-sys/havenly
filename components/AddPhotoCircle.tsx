import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function AddPhotoCircle({ label, caption }: { label: string; caption: string }) {
  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.circle}>
        <Ionicons name="person" size={22} color={colors.accent} />
        <Text style={styles.addLabel}>ADD PHOTO</Text>
      </Pressable>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  circle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  addLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  caption: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
