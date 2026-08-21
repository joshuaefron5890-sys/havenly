import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export type CommunityMessage = {
  id: string;
  text: string;
  postedByName: string;
  createdAt: Date | null;
};

// Live-subscribes to every community announcement, oldest first — same
// shape/ordering as a normal message thread (see lib/messages.ts's
// subscribeToMessages), just with no per-recipient participant list since
// this is one broadcast feed every signed-in family reads. Returns an
// unsubscribe function.
export function subscribeToCommunityMessages(callback: (messages: CommunityMessage[]) => void): () => void {
  if (!db) {
    return () => {};
  }
  const q = query(collection(db, 'communityMessages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: typeof data.text === 'string' ? data.text : '',
          postedByName: typeof data.postedByName === 'string' ? data.postedByName : 'Haven.ly',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        };
      })
    );
  });
}

// Only actually succeeds for a super admin — firestore.rules enforces
// that server-side (this file has no way to check it client-side beyond
// the UI hint in lib/superAdmin.ts), and a Cloud Function trigger on the
// new doc fans it out to every family as an email + push (see
// functions/index.js's notifyOnCommunityMessage).
export async function postCommunityMessage(text: string, postedByName: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  const trimmed = text.trim();
  if (!uid || !db || !trimmed) return;
  await addDoc(collection(db, 'communityMessages'), {
    text: trimmed,
    postedByUid: uid,
    postedByName,
    createdAt: serverTimestamp(),
  });
}
