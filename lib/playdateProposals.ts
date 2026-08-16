import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getOrCreateConversation, PlaydateProposalDetails, sendProposalMessage } from './messages';

export type PlaydateProposal = {
  id: string;
  conversationId: string;
  fromUid: string;
  toUid: string;
  createdAt: Date | null;
} & PlaydateProposalDetails;

// A lightweight, denormalized record of a proposal — the actual proposal
// lives as a message in the conversation (see lib/messages.ts's
// sendProposalMessage, which is what the message center/unread badge
// actually reacts to). This top-level collection exists purely so the
// Discover dashboard can cheaply ask "do I have a pending proposal?"
// without a collection-group query across every conversation's messages.
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
    createdAt: serverTimestamp(),
    ...details,
  });
  return conversationId;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// The single most recent pending proposal involving the signed-in user, if
// any — shown as the leading card in Discover's Events section. A one-time
// fetch (not a live subscription) since it's read once per dashboard visit,
// same as the other Discover sections.
export async function fetchLatestProposal(): Promise<PlaydateProposal | null> {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) return null;
  const q = query(
    collection(db, 'playdateProposals'),
    where('participantUids', 'array-contains', myUid),
    where('status', '==', 'proposed')
  );
  const snap = await getDocs(q);
  const proposals = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      conversationId: typeof data.conversationId === 'string' ? data.conversationId : '',
      fromUid: typeof data.fromUid === 'string' ? data.fromUid : '',
      toUid: typeof data.toUid === 'string' ? data.toUid : '',
      createdAt: toDate(data.createdAt),
      date: typeof data.date === 'string' ? data.date : '',
      dateLabel: typeof data.dateLabel === 'string' ? data.dateLabel : '',
      windowLabel: typeof data.windowLabel === 'string' ? data.windowLabel : '',
      venue: typeof data.venue === 'string' ? data.venue : '',
    };
  });
  if (!proposals.length) return null;
  // Sorted client-side rather than via a Firestore orderBy, same reasoning
  // as conversations — avoids needing a composite index for the
  // array-contains + equality + orderBy combination.
  proposals.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return proposals[0];
}
