import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { googleSignInSupported } from '../lib/firebase';
import { renderGoogleSignInButton } from '../lib/googleIdentity';

// Mounts Google's own rendered "Sign in with Google" button — see
// renderGoogleSignInButton's comment in lib/googleIdentity.ts for why this
// (rather than a plain styled Pressable calling the OAuth popup flow) is
// what actually avoids Google's "unverified app" warning. Renders nothing
// on native, since this needs a real DOM node to mount into.
export function GoogleSignInButton({
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
    if (!googleSignInSupported() || !containerRef.current || width == null) return;
    renderGoogleSignInButton(containerRef.current, width, onCredential, onError).catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  if (!googleSignInSupported()) {
    return null;
  }

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
});
