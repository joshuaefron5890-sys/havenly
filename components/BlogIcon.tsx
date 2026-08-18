import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

// Ionicons has no single "blog post" glyph — composites overlapping chat
// bubbles (the "someone's sharing their thoughts" shape) with a pencil
// peeking out of the top-right corner, mirroring the "writing" icon this
// was modeled on.
export function BlogIcon({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="chatbubbles" size={size} color={color} />
      <Ionicons
        name="pencil"
        size={size * 0.42}
        color={color}
        style={{ position: 'absolute', top: -size * 0.08, right: -size * 0.08 }}
      />
    </View>
  );
}
