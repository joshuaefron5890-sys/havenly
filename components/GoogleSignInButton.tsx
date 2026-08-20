import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { nativeGoogleSignIn } from '../lib/googleNativeAuth';
import { renderGoogleSignInButton } from '../lib/googleIdentity';
import { colors } from '../theme/colors';
import { images } from '../theme/images';

// Web renders Google's own styled button (see renderGoogleSignInButton's
// comment in lib/googleIdentity.ts for why); native has no DOM to mount
// that into, so it's a plain Pressable calling the actual Google Sign-In
// SDK (lib/googleNativeAuth.ts) instead — which, unlike the web flow, CAN
// be styled to match the rest of Haven.ly's buttons, since there's no
// Google-owned widget involved.
export function GoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (idToken: string) => void;
  onError: (err: Error) => void;
}) {
  if (Platform.OS !== 'web') {
    return <NativeGoogleSignInButton onCredential={onCredential} onError={onError} />;
  }
  return <WebGoogleSignInButton onCredential={onCredential} onError={onError} />;
}

function NativeGoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (idToken: string) => void;
  onError: (err: Error) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const idToken = await nativeGoogleSignIn();
      onCredential(idToken);
    } catch (err: any) {
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable style={styles.nativeButton} onPress={handlePress} disabled={loading}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Image source={images.googleLogo} style={styles.brandIcon} />
          <Text style={styles.nativeButtonText}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

// Mounts Google's own rendered "Sign in with Google" button — see
// renderGoogleSignInButton's comment in lib/googleIdentity.ts for why
// this (rather than a plain styled Pressable calling the OAuth popup
// flow) is what actually avoids Google's "unverified app" warning.
function WebGoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (idToken: string) => void;
  onError: (err: Error) => void;
}) {
  const containerRef = useRef<any>(null);
  // Google's button needs an explicit pixel width up front — measured from
  // the outer wrapper's actual laid-out width once, rather than guessed,
  // so it fills the same space Haven.ly's other full-width buttons do.
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || width == null) return;
    renderGoogleSignInButton(containerRef.current, width, onCredential, onError).catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => {
        const measured = Math.round(e.nativeEvent.layout.width);
        if (measured > 0) setWidth((prev) => prev ?? measured);
      }}
    >
      <View ref={containerRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  nativeButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    marginBottom: 16,
  },
  brandIcon: {
    width: 18,
    height: 18,
  },
  nativeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
