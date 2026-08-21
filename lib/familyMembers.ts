import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Kept in sync with functions/index.js's FAMILY_RELATIONSHIPS.
export const FAMILY_RELATIONSHIPS = ['Co-parent', 'Aunt', 'Uncle', 'Grandparent', 'Cousin', 'Close friend'] as const;
export type FamilyRelationship = (typeof FAMILY_RELATIONSHIPS)[number];

export type FamilyMember = {
  uid: string;
  name: string;
  relationship: string;
  photoUrl: string | null;
  role: 'owner' | 'member';
};

export type PendingFamilyInvite = {
  name: string;
  relationship: string;
  email: string;
};

export async function sendFamilyInvite(name: string, relationship: FamilyRelationship, email: string): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ name: string; relationship: string; email: string }, { sent: boolean }>(
    functions,
    'sendFamilyInvite'
  );
  await call({ name, relationship, email });
}

export async function getFamilyMembers(): Promise<{ members: FamilyMember[]; pendingInvites: PendingFamilyInvite[] }> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { members: FamilyMember[]; pendingInvites: PendingFamilyInvite[] }>(
    functions,
    'getFamilyMembers'
  );
  const result = await call();
  return result.data;
}

export type FamilyInviteDetails = {
  familyLabel: string;
  invitedByName: string;
  name: string;
  relationship: string;
};

// No auth required — this is called before the invitee has an account.
export async function getFamilyInvite(token: string): Promise<FamilyInviteDetails> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ token: string }, FamilyInviteDetails>(functions, 'getFamilyInvite');
  const result = await call({ token });
  return result.data;
}

// Called once the invitee is signed in with their own (possibly brand new)
// Firebase Auth account — links that account to the inviting family.
export async function acceptFamilyInvite(token: string, photoUrl: string | null): Promise<{ familyUid: string }> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ token: string; photoUrl: string | null }, { familyUid: string }>(
    functions,
    'acceptFamilyInvite'
  );
  const result = await call({ token, photoUrl });
  return result.data;
}
