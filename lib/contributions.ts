import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { DEFAULT_CLUSTER_ID } from './clusters';
import { getMyClusterId } from './clusterContext';
import { contributionKey, fetchHiddenKeys } from './moderation';

export type ContributionType = 'product' | 'podcast' | 'article' | 'event';

export type ContributionField = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
  // 'date' renders a calendar + time picker instead of a plain text
  // field (see components/DatePickerModal.tsx) — stores the formatted
  // label under this field's own key (displayed everywhere), plus a
  // real ISO timestamp for the same moment under "<key>Iso" (used only
  // by parseContributedEventDate below, to filter out past events).
  // 'image' renders an upload-a-photo-or-paste-a-link picker (see
  // ContributeModal) — the value stored is still just a URL string, same
  // shape as `url` above, just displayed as a photo everywhere else.
  type?: 'text' | 'date' | 'image';
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
      { key: 'imageUrl', label: 'Photo', type: 'image', optional: true },
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
  // The "Resources" tab's default sub-type — see RESOURCE_SUBTYPE_SCHEMAS
  // below for the other two (referral, blog). This entry stays the plain
  // article schema so a bare `CONTRIBUTION_SCHEMAS.article` lookup (still
  // used as the fallback default) keeps working exactly as before.
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
      { key: 'date', label: 'Date & time', type: 'date', optional: true },
      { key: 'venue', label: 'Location', placeholder: 'Address, or "Virtual"', optional: true },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'Details', multiline: true, optional: true },
    ],
  },
};

// The "Resources" tab (app/(tabs)/articles.tsx) covers three different
// kinds of contribution under the same 'article' ContributionType/Firestore
// collection — keeping them one type rather than three keeps
// firestore.rules, fetchContributions, etc. untouched. Which sub-type a
// given contribution is lives in fields.resourceType (see
// resourceSubtypeOf), not as its own top-level column, so an older
// contribution predating this feature (no resourceType at all) still reads
// back correctly as a plain article.
export type ResourceSubtype = 'article' | 'referral' | 'blog';

export const RESOURCE_SUBTYPE_SCHEMAS: Record<
  ResourceSubtype,
  // 'referral' and 'blog' are sentinels, not real Ionicons names — see
  // components/ReferralIcon.tsx and components/BlogIcon.tsx, which every
  // renderer of this field checks for first since Ionicons has no single
  // "refer a person" or "blog post" glyph.
  { noun: string; label: string; icon: keyof typeof Ionicons.glyphMap | 'referral' | 'blog'; fields: ContributionField[] }
> = {
  article: {
    noun: 'article',
    label: 'Article',
    icon: 'document-text-outline',
    fields: CONTRIBUTION_SCHEMAS.article.fields,
  },
  blog: {
    noun: 'blog',
    label: 'Blog',
    icon: 'blog',
    fields: [
      { key: 'title', label: 'Blog name' },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'What do they write about?', multiline: true, optional: true },
    ],
  },
  referral: {
    noun: 'referral',
    label: 'Referral',
    icon: 'referral',
    fields: [
      { key: 'title', label: 'Professional or practice name' },
      { key: 'specialty', label: 'Specialty' },
      { key: 'email', label: 'Email', optional: true },
      { key: 'phone', label: 'Phone number', optional: true },
      { key: 'url', label: 'Link', placeholder: 'https://…', optional: true },
      { key: 'description', label: 'Why do you recommend them?', multiline: true, optional: true },
    ],
  },
};

// Referrals need at least one way to reach the professional — email OR
// phone, not necessarily both — a rule ContributeModal's plain per-field
// optional/required flags can't express on their own, so it's checked
// explicitly via ContributeModal's `validate` prop wherever a referral form
// is shown.
export function validateReferralContact(values: Record<string, string>): string | null {
  return (values.email ?? '').trim() || (values.phone ?? '').trim()
    ? null
    : 'Add an email or phone number so families can reach out.';
}

// Reads back which of the three Resources sub-types a contribution is —
// defaults to 'article' both for contributions from before this feature
// existed (no resourceType field at all) and for any unrecognized value.
export function resourceSubtypeOf(contribution: Pick<Contribution, 'fields'>): ResourceSubtype {
  const value = contribution.fields.resourceType;
  return value === 'referral' || value === 'blog' ? value : 'article';
}

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
  // Falls back to DEFAULT_CLUSTER_ID for a contribution made before
  // clusters existed — see fetchContributions' own comment for why this
  // is filtered in code rather than in the Firestore query itself.
  clusterId: string;
  createdAt: Date | null;
};

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// Matches DatePickerModal's formatLabel output, e.g. "Wed, Sep 23 · 10:00 AM"
// — used only as a fallback for a contribution made before dateIso existed
// (see the 'date' field type comment above).
const EVENT_DATE_LABEL_RE = /^[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2})\s*·\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

// Resolves a community-submitted event's actual date, for filtering out
// past events. Prefers the "<key>Iso" companion field written alongside
// every 'date'-type field since this was added; falls back to parsing the
// older label-only format for a contribution made before that, using the
// current year (the label itself never carried one) — imperfect for an
// event whose intended year has since rolled over, but strictly better
// than never filtering those out at all. Returns null (never hidden) when
// there's nothing to go on, e.g. an event with no date set, since that
// field is optional.
export function parseContributedEventDate(fields: Record<string, string>): Date | null {
  for (const key of Object.keys(fields)) {
    if (!key.endsWith('Iso')) continue;
    const parsed = new Date(fields[key]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const label = fields.date;
  if (typeof label !== 'string') return null;
  const match = label.match(EVENT_DATE_LABEL_RE);
  if (!match) return null;
  const [, month, day, hour, minute, ampm] = match;
  const parsed = new Date(`${month} ${day}, ${new Date().getFullYear()} ${hour}:${minute} ${ampm}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Start of today, local time — an event later today still counts as
// "today," not yet past.
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseContribution(id: string, data: Record<string, unknown>): Contribution {
  const type = data.type;
  return {
    id,
    type: type === 'product' || type === 'podcast' || type === 'article' || type === 'event' ? type : 'article',
    fields: typeof data.fields === 'object' && data.fields !== null ? (data.fields as Record<string, string>) : {},
    contributedByUid: typeof data.contributedByUid === 'string' ? data.contributedByUid : '',
    contributedByName: typeof data.contributedByName === 'string' ? data.contributedByName : 'A Haven.ly family',
    clusterId: typeof data.clusterId === 'string' && data.clusterId ? data.clusterId : DEFAULT_CLUSTER_ID,
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
    clusterId: getMyClusterId(),
    createdAt: serverTimestamp(),
  });
}

// Only the original contributor can call this successfully — enforced
// again server-side in firestore.rules, which also pins every field
// except `fields`/`contributedByName`.
export async function updateContribution(
  id: string,
  fields: Record<string, string>,
  contributorName: string
): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(
    doc(db, 'contributions', id),
    { fields, contributedByName: contributorName.trim() || 'A Haven.ly family' },
    { merge: true }
  );
}

// Only the original contributor can call this successfully — enforced
// again server-side in firestore.rules.
export async function deleteContribution(id: string): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await deleteDoc(doc(db, 'contributions', id));
}

// Only queries by type (a single equality where — no composite index
// needed, unlike the array-contains combinations elsewhere in this app).
// Cluster is filtered here in code afterward, not in the query itself —
// Firestore's equality filters never match a document where the field is
// missing entirely, which every contribution made before clusters existed
// would be, so a where('clusterId', ...) clause would silently hide all
// of them. Sorted newest-first.
export async function fetchContributions(type: ContributionType): Promise<Contribution[]> {
  if (!db) return [];
  const q = query(collection(db, 'contributions'), where('type', '==', type));
  const [snap, hiddenKeys] = await Promise.all([getDocs(q), fetchHiddenKeys()]);
  const myClusterId = getMyClusterId();
  const cutoff = type === 'event' ? startOfToday() : null;
  const items = snap.docs
    .map((d) => parseContribution(d.id, d.data()))
    .filter((c) => c.clusterId === myClusterId && !hiddenKeys.has(contributionKey(c.id)))
    .filter((c) => {
      if (!cutoff) return true;
      const eventDate = parseContributedEventDate(c.fields);
      return !eventDate || eventDate.getTime() >= cutoff.getTime();
    });
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
