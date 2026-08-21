import { auth } from './firebase';

// The uid whose data ("family data" — profile, favorites, messages,
// playdate proposals) the signed-in person should see, which for an
// invited family member (see lib/familyMembers.ts) differs from their own
// Firebase Auth uid. AuthContext resolves this once per sign-in and caches
// it here so the many lib/*.ts functions that currently read
// auth?.currentUser?.uid synchronously (no React context available to
// them) can keep doing exactly that, just resolved through this instead.
let cachedFamilyUid: string | null = null;

export function setCachedFamilyUid(uid: string | null): void {
  cachedFamilyUid = uid;
}

// Falls back to the raw signed-in uid until AuthContext's resolution
// completes (or for the overwhelming majority of users, who are their own
// family's owner and never have a different value to resolve to) — so
// nothing here can turn into a hard "not ready yet" failure.
export function getMyFamilyUid(): string | null {
  return cachedFamilyUid ?? auth?.currentUser?.uid ?? null;
}
