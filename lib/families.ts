import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type SuggestedFamilyChild = {
  name: string;
  age: string;
  photoUrl: string | null;
};

export type SuggestedFamily = {
  uid: string;
  firstName: string;
  lastName: string;
  familyPhotoUrl: string | null;
  city: string;
  state: string;
  children: SuggestedFamilyChild[];
  // Weighted match score (functions/index.js computeMatch) — not a raw
  // overlap percentage, clamped to 50-97.
  matchScore: number;
};

// Other onboarded families, fetched server-side (functions/index.js
// getSuggestedFamilies) rather than queried directly against Firestore —
// each user doc also holds things (calendar refresh tokens, Apple
// app-specific passwords) that must stay private to that user.
export async function fetchSuggestedFamilies(): Promise<SuggestedFamily[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { families: SuggestedFamily[] }>(functions, 'getSuggestedFamilies');
  const result = await call();
  return result.data.families;
}

// Families the current user has favorited (see lib/favorites.ts for the
// uid list itself), fetched the same safe server-side way as
// fetchSuggestedFamilies.
export async function fetchFamiliesByUids(uids: string[]): Promise<SuggestedFamily[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  if (!uids.length) return [];
  const call = httpsCallable<{ uids: string[] }, { families: SuggestedFamily[] }>(functions, 'getFamiliesByUids');
  const result = await call({ uids });
  return result.data.families;
}

export function familyPhoto(family: SuggestedFamily): string | null {
  return family.familyPhotoUrl ?? family.children.find((c) => c.photoUrl)?.photoUrl ?? null;
}

// Batch-resolves each community contribution's own family photo, for the
// small avatar shown next to "Contributed by" on a card — one deduped
// fetchFamiliesByUids call per screen instead of one per card.
export async function fetchContributorPhotos(
  contributions: { contributedByUid: string }[]
): Promise<Map<string, string | null>> {
  const uids = [...new Set(contributions.map((c) => c.contributedByUid).filter(Boolean))];
  if (!uids.length) return new Map();
  const families = await fetchFamiliesByUids(uids);
  return new Map(families.map((f) => [f.uid, familyPhoto(f)]));
}

export function familySubtitle(family: SuggestedFamily): string {
  const kids = family.children
    .filter((c) => c.name)
    .map((c) => (c.age ? `${c.name}, ${c.age}` : c.name))
    .join(' · ');
  return kids || 'No kids listed yet';
}

// "The Frisch Family" — falls back to a first name, then a generic label,
// for a family that hasn't set a last name.
export function familyDisplayName(family: { firstName: string; lastName: string }): string {
  if (family.lastName) return `The ${family.lastName} Family`;
  if (family.firstName) return family.firstName;
  return 'A family';
}

// Everything here is an intersection with the viewer's own profile, not the
// target family's full data — functions/index.js getFamilyProfile only ever
// returns what the two of you have in common.
export type FamilyProfile = {
  uid: string;
  firstName: string;
  lastName: string;
  familyPhotoUrl: string | null;
  city: string;
  state: string;
  children: SuggestedFamilyChild[];
  sharedInterests: string[];
  sharedNeurodivergence: string[];
  sharedPlayStyle: string[];
  sharedAvailability: string[];
  // Weighted match score (functions/index.js computeMatchScore) — not a
  // raw overlap percentage, clamped to 50-97.
  matchScore: number;
};

// The public profile screen (app/family/[id].tsx), tapped from a Discover
// row — fetched server-side (getFamilyProfile) since it needs the caller's
// own profile too, to compute what's actually shared with the target
// family, without handing that comparison data to the client to do itself.
export async function fetchFamilyProfile(uid: string): Promise<FamilyProfile> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ uid: string }, FamilyProfile>(functions, 'getFamilyProfile');
  const result = await call({ uid });
  return result.data;
}
