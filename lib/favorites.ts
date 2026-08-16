import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// A user's own favorites, stored directly on their own Firestore doc
// (users/{uid}.<field>) — a normal write to one's own document, unlike
// reading another family's info (which goes through a Cloud Function; see
// functions/index.js's toPublicFamily comment). Podcasts/products/resources
// aren't another user's private data, so favoriting them never needs one.
type FavoriteField = 'favoriteFamilyUids' | 'favoritePodcastIds' | 'favoriteProductUrls' | 'favoriteResourceUrls';

async function getFavoriteIds(uid: string, field: FavoriteField): Promise<string[]> {
  if (!db) return [];
  const snap = await getDoc(doc(db, 'users', uid));
  const ids = snap.data()?.[field];
  return Array.isArray(ids) ? ids : [];
}

async function addFavorite(field: FavoriteField, id: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return;
  await setDoc(doc(db, 'users', uid), { [field]: arrayUnion(id) }, { merge: true });
}

async function removeFavorite(field: FavoriteField, id: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return;
  await setDoc(doc(db, 'users', uid), { [field]: arrayRemove(id) }, { merge: true });
}

export const getFavoriteFamilyUids = (uid: string) => getFavoriteIds(uid, 'favoriteFamilyUids');
export const addFavoriteFamily = (familyUid: string) => addFavorite('favoriteFamilyUids', familyUid);
export const removeFavoriteFamily = (familyUid: string) => removeFavorite('favoriteFamilyUids', familyUid);

export const getFavoritePodcastIds = (uid: string) => getFavoriteIds(uid, 'favoritePodcastIds');
export const addFavoritePodcast = (podcastId: string) => addFavorite('favoritePodcastIds', podcastId);
export const removeFavoritePodcast = (podcastId: string) => removeFavorite('favoritePodcastIds', podcastId);

export const getFavoriteProductUrls = (uid: string) => getFavoriteIds(uid, 'favoriteProductUrls');
export const addFavoriteProduct = (productUrl: string) => addFavorite('favoriteProductUrls', productUrl);
export const removeFavoriteProduct = (productUrl: string) => removeFavorite('favoriteProductUrls', productUrl);

export const getFavoriteResourceUrls = (uid: string) => getFavoriteIds(uid, 'favoriteResourceUrls');
export const addFavoriteResource = (resourceUrl: string) => addFavorite('favoriteResourceUrls', resourceUrl);
export const removeFavoriteResource = (resourceUrl: string) => removeFavorite('favoriteResourceUrls', resourceUrl);
