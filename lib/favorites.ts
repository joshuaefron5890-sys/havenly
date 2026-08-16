import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// A user's own favorited-family uids, stored directly on their own
// Firestore doc (users/{uid}.favoriteFamilyUids) — a normal write to one's
// own document, unlike reading another family's info (which goes through a
// Cloud Function; see functions/index.js's toPublicFamily comment).
export async function getFavoriteFamilyUids(uid: string): Promise<string[]> {
  if (!db) return [];
  const snap = await getDoc(doc(db, 'users', uid));
  const ids = snap.data()?.favoriteFamilyUids;
  return Array.isArray(ids) ? ids : [];
}

export async function addFavoriteFamily(familyUid: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return;
  await setDoc(doc(db, 'users', uid), { favoriteFamilyUids: arrayUnion(familyUid) }, { merge: true });
}

export async function removeFavoriteFamily(familyUid: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return;
  await setDoc(doc(db, 'users', uid), { favoriteFamilyUids: arrayRemove(familyUid) }, { merge: true });
}
