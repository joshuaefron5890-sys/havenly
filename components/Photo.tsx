import { Image, ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

export function Photo({ source, style }: { source?: ImageSourcePropType; style?: StyleProp<ImageStyle> }) {
  if (source) {
    return <Image source={source} style={style} resizeMode="cover" />;
  }
  return <View style={[style as StyleProp<ViewStyle>, styles.placeholder]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.accentMuted,
  },
});
