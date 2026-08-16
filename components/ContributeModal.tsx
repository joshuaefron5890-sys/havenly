import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './AppText';
import { FieldInput } from './FieldInput';
import { ContributionField } from '../lib/contributions';
import { colors } from '../theme/colors';

// One generic bottom-sheet form reused by every "Contribute" CTA (Events,
// Products, Podcasts, Articles) — each screen supplies its own field
// schema (see lib/contributions.ts's CONTRIBUTION_SCHEMAS) instead of this
// component knowing anything type-specific, so a new content type never
// needs a new modal.
export function ContributeModal({
  visible,
  title,
  fields,
  defaultName,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  fields: ContributionField[];
  defaultName: string;
  onClose: () => void;
  onSubmit: (contributorName: string, values: Record<string, string>) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = fields.some((f) => !f.optional && !(values[f.key] ?? '').trim());
  const canSubmit = Boolean(name.trim()) && !missingRequired && !submitting;

  const close = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name, values);
      setValues({});
      onClose();
    } catch {
      setError('Couldn’t submit that — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <FieldInput label="Your name" placeholder="How should we credit you?" value={name} onChangeText={setName} />
            {fields.map((f) =>
              f.multiline ? (
                <View key={f.key} style={styles.multilineWrap}>
                  <Text style={styles.multilineLabel}>
                    {f.label}
                    {f.optional ? <Text style={styles.optional}> · optional</Text> : null}
                  </Text>
                  <TextInput
                    style={styles.multilineInput}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textMuted}
                    value={values[f.key] ?? ''}
                    onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
                    multiline
                  />
                </View>
              ) : (
                <FieldInput
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  optional={f.optional}
                  value={values[f.key] ?? ''}
                  onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
                />
              )
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  multilineWrap: {
    marginBottom: 16,
  },
  multilineLabel: {
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
  multilineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 12,
  },
  footer: {
    padding: 20,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
