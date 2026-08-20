import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { DatePickerModal } from './DatePickerModal';
import { FieldInput } from './FieldInput';
import { PhotoCropperModal } from './PhotoCropperModal';
import { ContributionField } from '../lib/contributions';
import { pickAndUploadNativePhoto, pickImageFile, uploadPhotoBlob } from '../lib/photoUpload';
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
  initialValues,
  submitLabel = 'Submit',
  validate,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  fields: ContributionField[];
  defaultName: string;
  // Pre-fills the form — used when editing an existing contribution rather
  // than creating a new one. Only read once at mount, same as defaultName,
  // since each edit gets its own ContributeModal instance scoped to that
  // one contribution rather than a shared/reused one.
  initialValues?: Record<string, string>;
  submitLabel?: string;
  // Extra validation beyond the built-in per-field optional/required check —
  // e.g. "at least one of these two fields" can't be expressed as a single
  // field's `optional` flag. Returning a message blocks submit and shows it
  // the same way a submit failure does; returning null/undefined allows it.
  validate?: (values: Record<string, string>) => string | null | undefined;
  onClose: () => void;
  onSubmit: (contributorName: string, values: Record<string, string>) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerKey, setDatePickerKey] = useState<string | null>(null);
  const [activeImageKey, setActiveImageKey] = useState<string | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const missingRequired = fields.some((f) => !f.optional && !(values[f.key] ?? '').trim());
  const canSubmit = Boolean(name.trim()) && !missingRequired && !submitting;

  const close = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handlePickImage = async (key: string) => {
    setImageError(null);
    if (Platform.OS === 'web') {
      const file = await pickImageFile();
      if (file) {
        setActiveImageKey(key);
        setPickedPhoto(file);
      }
      return;
    }
    // Native has no DOM File/canvas to hand off to PhotoCropperModal — the
    // OS's own picker (with its own built-in crop step) does the whole
    // pick-crop-upload job in one call instead.
    setActiveImageKey(key);
    setUploadingImage(true);
    try {
      const url = await pickAndUploadNativePhoto(`contribution-${Date.now()}.jpg`);
      if (url) setValues((prev) => ({ ...prev, [key]: url }));
    } catch {
      setImageError('Couldn’t upload that photo — check your photo library permission and try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageCropConfirm = async (blob: Blob) => {
    const key = activeImageKey;
    setPickedPhoto(null);
    if (!key) return;
    setUploadingImage(true);
    setImageError(null);
    try {
      const url = await uploadPhotoBlob(blob, `contribution-${Date.now()}.jpg`);
      setValues((prev) => ({ ...prev, [key]: url }));
    } catch {
      setImageError('Couldn’t upload that photo — check your connection and try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const validationError = validate?.(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name, values);
      setValues(initialValues ?? {});
      onClose();
    } catch {
      setError('Couldn’t submit that — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            {fields.map((f) => {
              if (f.type === 'date') {
                return (
                  <View key={f.key} style={styles.dateWrap}>
                    <Text style={styles.multilineLabel}>
                      {f.label}
                      {f.optional ? <Text style={styles.optional}> · optional</Text> : null}
                    </Text>
                    <Pressable style={styles.dateButton} onPress={() => setDatePickerKey(f.key)}>
                      <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                      <Text style={values[f.key] ? styles.dateButtonText : styles.dateButtonPlaceholder}>
                        {values[f.key] || 'Select a date'}
                      </Text>
                    </Pressable>
                  </View>
                );
              }
              if (f.type === 'image') {
                const value = values[f.key] ?? '';
                const busy = uploadingImage && activeImageKey === f.key;
                return (
                  <View key={f.key} style={styles.imageWrap}>
                    <Text style={styles.multilineLabel}>
                      {f.label}
                      {f.optional ? <Text style={styles.optional}> · optional</Text> : null}
                    </Text>
                    {value ? (
                      <View style={styles.imagePreviewRow}>
                        <Image source={{ uri: value }} style={styles.imagePreview} />
                        <Pressable
                          style={styles.imageRemove}
                          onPress={() => setValues((prev) => ({ ...prev, [f.key]: '' }))}
                          hitSlop={8}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.imageUploadButton}
                      onPress={() => handlePickImage(f.key)}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={16} color={colors.accent} />
                          <Text style={styles.imageUploadText}>
                            {value ? 'Change photo' : 'Take or upload a photo'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                    <FieldInput
                      label="Or paste an image link"
                      placeholder="https://…"
                      optional
                      value={value}
                      onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
                    />
                    {imageError && activeImageKey === f.key ? <Text style={styles.error}>{imageError}</Text> : null}
                  </View>
                );
              }
              return f.multiline ? (
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
              );
            })}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom) }]}>
            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <DatePickerModal
        visible={datePickerKey !== null}
        onClose={() => setDatePickerKey(null)}
        onConfirm={(label) => {
          if (!datePickerKey) return;
          setValues((prev) => ({ ...prev, [datePickerKey]: label }));
        }}
      />
      <PhotoCropperModal file={pickedPhoto} onCancel={() => setPickedPhoto(null)} onConfirm={handleImageCropConfirm} />
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
  dateWrap: {
    marginBottom: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateButtonText: {
    fontSize: 15,
    color: colors.text,
  },
  dateButtonPlaceholder: {
    fontSize: 15,
    color: colors.textMuted,
  },
  imageWrap: {
    marginBottom: 16,
  },
  imagePreviewRow: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
  },
  imageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  imageUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  imageUploadText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
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
