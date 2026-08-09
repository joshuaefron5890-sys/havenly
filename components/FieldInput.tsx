import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';

export function FieldInput({
  label,
  placeholder,
  optional,
}: {
  label: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
});
