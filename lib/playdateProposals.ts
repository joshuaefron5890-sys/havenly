import {
  addDoc,
  collection,
  doc,
  DocumentSnapshot,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { getOrCreateConversation, PlaydateProposalDetails, sendProposalMessage } from './messages';

export type ProposalStatus = 'proposed' | 'accepted' | 'declined';

export type PlaydateProposal = {
  id: string;
  conversationId: string;
  fromUid: string;
  toUid: string;
  status: ProposalStatus;
  note: string;
  createdAt: Date | null;
} & PlaydateProposalDetails;

// A lightweight, denormalized record of a proposal — the actual proposal
// lives as a message in the conversation (see lib/messages.ts's
// sendProposalMessage, which is what the message center/unread badge
// actually reacts to). This top-level collection exists purely so the
// Discover dashboard can cheaply ask "do I have a pending proposal?"
// without a collection-group query across every conversation's messages,
// and so status (accepted/declined) has one place to live rather than
// being duplicated onto the message doc too.
export async function createPlaydateProposal(
  toUid: string,
  details: PlaydateProposalDetails,
  note: string
): Promise<string> {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) {
    throw new Error('not-signed-in');
  }
  const conversationId = await getOrCreateConversation(toUid);
  await sendProposalMessage(conversationId, details, note);
  await addDoc(collection(db, 'playdateProposals'), {
    conversationId,
    fromUid: myUid,
    toUid,
    participantUids: [myUid, toUid],
    status: 'proposed',
    note: note.trim(),
    createdAt: serverTimestamp(),
    ...details,
  });
  return conversationId;
}

// Only the recipient can respond, and only while it's still pending — both
// enforced again server-side in firestore.rules.
export async function respondToProposal(proposalId: string, status: 'accepted' | 'declined'): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(doc(db, 'playdateProposals', proposalId), { status }, { merge: true });
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseProposal(id: string, data: Record<string, unknown>): PlaydateProposal {
  const status = data.status;
  return {
    id,
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : '',
    fromUid: typeof data.fromUid === 'string' ? data.fromUid : '',
    toUid: typeof data.toUid === 'string' ? data.toUid : '',
    status: status === 'accepted' || status === 'declined' ? status : 'proposed',
    note: typeof data.note === 'string' ? data.note : '',
    createdAt: toDate(data.createdAt),
    date: typeof data.date === 'string' ? data.date : '',
    dateLabel: typeof data.dateLabel === 'string' ? data.dateLabel : '',
    windowLabel: typeof data.windowLabel === 'string' ? data.windowLabel : '',
    venue: typeof data.venue === 'string' ? data.venue : '',
  };
}

// The single most recent pending proposal involving the signed-in user, if
// any — shown as the leading card in Discover's Events section. A one-time
// fetch (not a live subscription) since it's read once per dashboard visit,
// same as the other Discover sections.
//
// Only filters by participantUids array-contains here — adding a second
// where() on status would need a Firestore composite index, so "proposed"
// is filtered client-side instead (same array-contains-only pattern used by
// subscribeToConversations).
export async function fetchLatestProposal(): Promise<PlaydateProposal | null> {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) return null;
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.status === 'proposed');
  if (!proposals.length) return null;
  proposals.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return proposals[0];
}

// Live feed of every proposal involving the signed-in user, across all
// conversations — the message thread screen filters this client-side down
// to its own conversationId to know whether a proposal it's rendering is
// still pending, and to react instantly when the other side responds.
export function subscribeToMyProposals(callback: (proposals: PlaydateProposal[]) => void): () => void {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => parseProposal(d.id, d.data())));
  });
}

// Live view of a single proposal by id — backs the standalone
// app/proposal/[id].tsx screen. A single-document read/subscription isn't
// subject to the composite-index constraint above (that only applies to
// multi-field list queries), so no client-side filtering is needed here.
export function subscribeToProposal(
  proposalId: string,
  callback: (proposal: PlaydateProposal | null) => void
): () => void {
  if (!db) {
    callback(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'playdateProposals', proposalId), (snap: DocumentSnapshot) => {
    callback(snap.exists() ? parseProposal(snap.id, snap.data() as Record<string, unknown>) : null);
  });
}
