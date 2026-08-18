import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

// Ionicons has no single "refer this person" glyph — composites a solid
// person silhouette with a forward arrow poking out from its shoulder,
// mirroring the generic "share this contact" icon referrals are modeled on.
export function ReferralIcon({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="person" size={size} color={color} style={{ marginRight: size * 0.2 }} />
      <Ionicons
        name="arrow-redo"
        size={size * 0.52}
        color={color}
        style={{ position: 'absolute', right: -size * 0.06, bottom: size * 0.06 }}
      />
    </View>
  );
}
