import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { auth, db } from './firebase';

export type ContributionType = 'product' | 'podcast' | 'article' | 'event';

export type ContributionField = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
};

// One schema per content type — shared by the "Contribute" form on each
// tab and the generic detail screen (app/contribution/[id].tsx), so the
// field list, labels, and order only live in one place.
export const CONTRIBUTION_SCHEMAS: Record<
  ContributionType,
  { noun: string; fields: ContributionField[] }
> = {
  product: {
    noun: 'product',
    fields: [
      { key: 'title', label: 'Product name' },
      { key: 'vendor', label: "Brand or where it's from", optional: true },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'Why do you recommend it?', multiline: true, optional: true },
    ],
  },
  podcast: {
    noun: 'podcast',
    fields: [
      { key: 'title', label: 'Show name' },
      { key: 'creator', label: 'Host or creator', optional: true },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: "What's it about?", multiline: true, optional: true },
    ],
  },
  article: {
    noun: 'article',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'Why is it worth reading?', multiline: true, optional: true },
    ],
  },
  event: {
    noun: 'event',
    fields: [
      { key: 'title', label: 'Event name' },
      { key: 'date', label: 'Date & time', placeholder: 'e.g. Sat, Sep 6 · 10:00 AM', optional: true },
      { key: 'venue', label: 'Location', placeholder: 'Address, or "Virtual"', optional: true },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'Details', multiline: true, optional: true },
    ],
  },
};

// Free-form key/value fields rather than one typed shape per content type —
// each tab defines its own form schema (see ContributeModal usages) and
// just reads back whatever keys it wrote, so adding a field to one type's
// form never touches the other three.
export type Contribution = {
  id: string;
  type: ContributionType;
  fields: Record<string, string>;
  contributedByUid: string;
  contributedByName: string;
  createdAt: Date | null;
};

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseContribution(id: string, data: Record<string, unknown>): Contribution {
  const type = data.type;
  return {
    id,
    type: type === 'product' || type === 'podcast' || type === 'article' || type === 'event' ? type : 'article',
    fields: typeof data.fields === 'object' && data.fields !== null ? (data.fields as Record<string, string>) : {},
    contributedByUid: typeof data.contributedByUid === 'string' ? data.contributedByUid : '',
    contributedByName: typeof data.contributedByName === 'string' ? data.contributedByName : 'A Haven.ly family',
    createdAt: toDate(data.createdAt),
  };
}

// A user contributing their own pick isn't reading anyone else's private
// data and the result is meant to be visible to every signed-in family, so
// this is a direct client write/read governed by firestore.rules — same
// reasoning as conversations/playdateProposals — rather than a Cloud
// Function.
export async function createContribution(
  type: ContributionType,
  fields: Record<string, string>,
  contributorName: string
): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) throw new Error('not-signed-in');
  await addDoc(collection(db, 'contributions'), {
    type,
    fields,
    contributedByUid: uid,
    contributedByName: contributorName.trim() || 'A Haven.ly family',
    createdAt: serverTimestamp(),
  });
}

// Only filters by type (a single equality where — no composite index
// needed, unlike the array-contains combinations elsewhere in this app);
// sorted newest-first client-side.
export async function fetchContributions(type: ContributionType): Promise<Contribution[]> {
  if (!db) return [];
  const q = query(collection(db, 'contributions'), where('type', '==', type));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => parseContribution(d.id, d.data()));
  items.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return items;
}

// Backs the generic app/contribution/[id].tsx detail screen for the rare
// case it's opened without the fields already in hand (e.g. a shared link)
// — the normal navigation path passes fields via route params instead,
// same as the product/podcast/article detail screens already do.
export async function fetchContributionById(id: string): Promise<Contribution | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'contributions', id));
  return snap.exists() ? parseContribution(snap.id, snap.data()) : null;
}
