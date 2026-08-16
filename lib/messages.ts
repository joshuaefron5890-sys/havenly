import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type Conversation = {
  id: string;
  participantUids: string[];
  lastMessage: string;
  lastMessageAt: Date | null;
};

export type Message = {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Date | null;
};

// Sorted so the same two people always land on the same conversation id —
// starting a chat from either side, or more than once, never creates a
// duplicate thread.
function conversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export function otherParticipant(conversation: Conversation, myUid: string): string | undefined {
  return conversation.participantUids.find((uid) => uid !== myUid);
}

// Creates the conversation doc if it doesn't exist yet, and returns its id
// either way. Deliberately doesn't check first with a getDoc — Firestore
// security rules evaluate a read against a non-existent document with
// `resource` bound to null, so a rule that checks resource.data.* (ours
// does, to confirm you're a participant) denies that read outright, before
// ever finding out the doc simply isn't there yet. Writing unconditionally
// sidesteps that: Firestore rules treat this as `create` when the doc is
// new (governed by request.resource.data, no read required) and `update`
// when it already exists. Only participantUids is written — the exact
// same value every time — so re-opening an existing conversation never
// clobbers its lastMessage/lastMessageAt.
export async function getOrCreateConversation(otherUid: string): Promise<string> {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) {
    throw new Error('not-signed-in');
  }
  const id = conversationId(myUid, otherUid);
  await setDoc(doc(db, 'conversations', id), { participantUids: [myUid, otherUid] }, { merge: true });
  return id;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// Live-subscribes to the signed-in user's conversations. Sorted client-side
// rather than via a Firestore orderBy, which would need a composite index
// for the array-contains + orderBy combination — not worth it for what's
// realistically a short list per user. Returns an unsubscribe function.
export function subscribeToConversations(callback: (conversations: Conversation[]) => void): () => void {
  const myUid = auth?.currentUser?.uid;
  if (!myUid || !db) {
    return () => {};
  }
  const q = query(collection(db, 'conversations'), where('participantUids', 'array-contains', myUid));
  return onSnapshot(q, (snap) => {
    const conversations = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        participantUids: Array.isArray(data.participantUids) ? data.participantUids : [],
        lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
        lastMessageAt: toDate(data.lastMessageAt),
      };
    });
    conversations.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
    callback(conversations);
  });
}

// Live-subscribes to one conversation's messages, oldest first. Returns an
// unsubscribe function.
export function subscribeToMessages(id: string, callback: (messages: Message[]) => void): () => void {
  if (!db) {
    return () => {};
  }
  const q = query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
          text: typeof data.text === 'string' ? data.text : '',
          createdAt: toDate(data.createdAt),
        };
      })
    );
  });
}

export async function sendMessage(id: string, text: string): Promise<void> {
  const myUid = auth?.currentUser?.uid;
  const trimmed = text.trim();
  if (!myUid || !db || !trimmed) return;
  await addDoc(collection(db, 'conversations', id, 'messages'), {
    senderUid: myUid,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'conversations', id), { lastMessage: trimmed, lastMessageAt: serverTimestamp() }, { merge: true });
}
