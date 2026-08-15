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
  familyPhotoUrl: string | null;
  children: SuggestedFamilyChild[];
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

export function familyPhoto(family: SuggestedFamily): string | null {
  return family.familyPhotoUrl ?? family.children.find((c) => c.photoUrl)?.photoUrl ?? null;
}

export function familySubtitle(family: SuggestedFamily): string {
  const kids = family.children
    .filter((c) => c.name)
    .map((c) => (c.age ? `${c.name}, ${c.age}` : c.name))
    .join(' · ');
  return kids || 'No kids listed yet';
}
