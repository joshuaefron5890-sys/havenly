import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

// Two puzzle-piece glyphs, one mirrored and slightly offset from the
// other, standing in for "two pieces connecting" — Ionicons only ships a
// single-piece "extension-puzzle" glyph, so this fakes the interlocking
// look by overlapping a normal and a horizontally-flipped copy of it,
// the same overlap idiom SquareCard's pairImages avatars already use.
export function PuzzleMatchIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const offset = Math.round(size * 0.34);
  return (
    <View style={{ width: size + offset, height: size }}>
      <Ionicons name="extension-puzzle" size={size} color={color} style={{ position: 'absolute', left: 0, top: 0 }} />
      <Ionicons
        name="extension-puzzle"
        size={size}
        color={color}
        style={{ position: 'absolute', left: offset, top: 0, transform: [{ scaleX: -1 }] }}
      />
    </View>
  );
}
