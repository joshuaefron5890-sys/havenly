import { router } from 'expo-router';
import { Platform } from 'react-native';

// Every "back" chevron in the app should call this instead of a bare
// router.back() — on a hard page refresh (or opening a deep link/bookmark
// straight to a detail screen) expo-router's in-memory history is empty
// even though the user is looking at what feels like a "sub" screen, so
// router.back() silently does nothing. Falling back to '/' — which
// app/index.tsx already routes to the right signed-in home for whatever
// kind of account is signed in — keeps the back button meaningful no
// matter how the screen was actually reached.
export function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

// On web this opens /privacy in a new tab, so reading it never navigates
// away from (and loses) whatever the visitor was in the middle of —
// filling out a form, mid-signup, etc. Native has no concept of tabs, so
// it just pushes the route like any other in-app navigation.
export function openPrivacyPolicy(): void {
  if (Platform.OS === 'web') {
    window.open('/privacy', '_blank');
  } else {
    router.push('/privacy');
  }
}
