import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getMyClusterId } from './clusterContext';

export type CommunityMessage = {
  id: string;
  text: string;
  postedByName: string;
  createdAt: Date | null;
};

// Live-subscribes to the signed-in family's own cluster's announcements
// only (see lib/clusters.ts) — same shape/ordering as a normal message
// thread (see lib/messages.ts's subscribeToMessages), just with no
// per-recipient participant list since this is one broadcast feed every
// family in the cluster reads. Returns an unsubscribe function.
export function subscribeToCommunityMessages(callback: (messages: CommunityMessage[]) => void): () => void {
  if (!db) {
    return () => {};
  }
  const q = query(
    collection(db, 'communityMessages'),
    where('clusterId', '==', getMyClusterId()),
    orderBy('createdAt', 'asc')
  );
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

// Only actually succeeds for that cluster's admin — firestore.rules
// enforces that server-side (this file has no way to check it client-side
// beyond the UI hint in lib/superAdmin.ts), and a Cloud Function trigger
// on the new doc fans it out to every family in the same cluster as an
// email + push (see functions/index.js's notifyOnCommunityMessage).
export async function postCommunityMessage(text: string, postedByName: string): Promise<void> {
  const uid = auth?.currentUser?.uid;
  const trimmed = text.trim();
  if (!uid || !db || !trimmed) return;
  await addDoc(collection(db, 'communityMessages'), {
    text: trimmed,
    postedByUid: uid,
    postedByName,
    clusterId: getMyClusterId(),
    createdAt: serverTimestamp(),
  });
}
