import { KeyboardTypeOptions, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

export function FieldInput({
  label,
  placeholder,
  optional,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  error,
  multiline,
  onSubmitEditing,
  returnKeyType,
}: {
  label: string;
  placeholder?: string;
  optional?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  multiline?: boolean;
  // Fires on the native keyboard's return key, and — for a non-multiline
  // field on web — on the Enter key too, so a form's primary button can be
  // triggered without reaching for the mouse.
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go' | 'send';
}) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, error && styles.inputError]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
    letterSpacing: 1.5,
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
  inputError: {
    borderColor: colors.error,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 6,
  },
});
