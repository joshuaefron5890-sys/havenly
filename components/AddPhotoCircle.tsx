import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function AddPhotoCircle({
  label,
  caption,
  imageUri,
  uploading,
  onPress,
}: {
  label: string;
  caption: string;
  imageUri?: string | null;
  uploading?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.circle} onPress={onPress} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color={colors.accent} />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <>
            <Ionicons name="person" size={22} color={colors.accent} />
            <Text style={styles.addLabel}>ADD PHOTO</Text>
          </>
        )}
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
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
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
