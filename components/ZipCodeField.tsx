import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from './AppText';
import { lookupZipCode } from '../lib/zipcode';
import { colors } from '../theme/colors';

// A zip code input that verifies itself against a public zip→city lookup
// as you type (debounced), the way most apps confirm "did you type that
// right?" — showing the resolved city/state back to the user rather than
// silently trusting five digits.
export function ZipCodeField({
  zip,
  city,
  state,
  onChange,
}: {
  zip: string;
  city: string;
  state: string;
  onChange: (next: { zip: string; city: string; state: string }) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>(city ? 'ok' : 'idle');
  const requestId = useRef(0);

  useEffect(() => {
    if (zip.length !== 5) {
      setStatus('idle');
      return;
    }
    // Already resolved for this exact zip (e.g. loaded from a saved
    // profile) — no need to re-check on mount.
    if (city && status === 'ok') return;

    const id = ++requestId.current;
    setStatus('checking');
    const timeout = setTimeout(() => {
      lookupZipCode(zip).then((result) => {
        if (requestId.current !== id) return; // a newer keystroke superseded this
        if (result) {
          setStatus('ok');
          onChange({ zip, city: result.city, state: result.state });
        } else {
          setStatus('error');
          onChange({ zip, city: '', state: '' });
        }
      });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>ZIP CODE</Text>
      <TextInput
        style={[styles.input, status === 'error' && styles.inputError]}
        placeholder="10001"
        placeholderTextColor={colors.textMuted}
        value={zip}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 5);
          setStatus('idle');
          onChange({ zip: digits, city: '', state: '' });
        }}
        keyboardType="number-pad"
        maxLength={5}
      />
      {status === 'checking' ? <Text style={styles.hint}>Checking…</Text> : null}
      {status === 'ok' && city ? (
        <Text style={styles.hintResolved}>
          {city}, {state}
        </Text>
      ) : null}
      {status === 'error' ? <Text style={styles.errorText}>Couldn’t find that zip code — double check it.</Text> : null}
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
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  hintResolved: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.positive,
    marginTop: 6,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 6,
  },
});
