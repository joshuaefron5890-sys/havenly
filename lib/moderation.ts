import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

// Type-prefixed identifiers for a piece of content that has no Firestore
// doc of its own to reference by id (a curated event/podcast/product/
// article/blog post only exists as an in-memory API response) — built the
// same way here (client, when hiding) and in functions/index.js (server,
// when filtering each feed), so the two sides always agree on what a given
// item is called. A community contribution DOES have a real doc, but
// hiding uses this same mechanism for it too (rather than deleting the
// doc outright) so every hide is one consistent, reversible action.
export function eventKey(link: string): string {
  return `event:${link}`;
}
export function podcastKey(id: string): string {
  return `podcast:${id}`;
}
export function productKey(url: string): string {
  return `product:${url}`;
}
export function articleKey(url: string): string {
  return `article:${url}`;
}
export function blogKey(url: string): string {
  return `blog:${url}`;
}
export function contributionKey(id: string): string {
  return `contribution:${id}`;
}

// Only ever succeeds for a cluster admin — firestore.rules blocks every
// direct client write to hiddenContent, and the Cloud Function itself
// checks isClusterAdmin again server-side. The UI hint (isSuperAdminEmail)
// is what actually decides whether the delete affordance even renders.
export async function hideContent(key: string, title: string): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ key: string; title: string }, void>(functions, 'hideContent');
  await call({ key, title });
}

export async function unhideContent(key: string): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ key: string }, void>(functions, 'unhideContent');
  await call({ key });
}

export type HiddenItem = {
  key: string;
  title: string;
  hiddenByEmail: string;
};

// Powers the admin "Hidden items" review screen — every hide is
// reversible, not a one-way delete.
export async function fetchHiddenContent(): Promise<HiddenItem[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, { items: HiddenItem[] }>(functions, 'getHiddenContent');
  const result = await call();
  return result.data.items;
}

// Direct Firestore read (not a Cloud Function) — every signed-in family
// needs this, not just admins, since lib/contributions.ts's
// fetchContributions reads the contributions collection directly and has
// to filter out hidden ones itself. Curated feeds don't need this
// client-side; those are filtered server-side inside the Cloud Functions
// that fetch them, which already have Admin SDK access.
export async function fetchHiddenKeys(): Promise<Set<string>> {
  if (!db) return new Set();
  const snap = await getDocs(collection(db, 'hiddenContent'));
  return new Set(snap.docs.map((d) => d.data().key).filter((k): k is string => typeof k === 'string'));
}
