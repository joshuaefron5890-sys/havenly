import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DesktopTabSidebar } from '../../components/DesktopTabSidebar';
import { useIsDesktop } from '../../lib/responsive';
import { colors } from '../../theme/colors';

// Profile lives outside the (tabs) group (reached from a header menu, not
// a bottom tab), so it never picked up (tabs)'s desktop sidebar
// automatically — same DesktopTabSidebar component, just applied here
// directly. Converted from a single app/profile.tsx file to this
// folder + _layout.tsx purely to get a layout to hook into; the route
// itself is still exactly /profile.
export default function ProfileLayout() {
  const isDesktop = useIsDesktop();
  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;

  if (!isDesktop) return stack;

  return (
    <View style={styles.desktopRow}>
      <DesktopTabSidebar />
      <View style={styles.desktopMain}>
        <View style={styles.desktopStackWrap}>{stack}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopMain: {
    flex: 1,
    alignItems: 'center',
  },
  desktopStackWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
  },
});
