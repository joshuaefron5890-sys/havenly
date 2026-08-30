import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type ReferralStats = {
  // Null only in the brief window between account creation and
  // functions/index.js's onSitterProfileCreated trigger actually running.
  code: string | null;
  payoutMethod: 'venmo' | 'paypal' | null;
  payoutHandle: string | null;
  referredCount: number;
  // Of referredCount, how many have actually cleared vetting — the point
  // at which both sides' $15 is earned (see setSitterVettingStatus).
  approvedCount: number;
  pendingCount: number;
  // Dollar totals across every referralPayouts row where this sitter is
  // the payee — as a referrer for someone else's signup, or as themselves
  // having been referred in.
  earnedPaid: number;
  owedPending: number;
};

// Own stats only — code, running totals, payout info on file. Goes through
// a Cloud Function rather than a direct Firestore read because counting
// "who signed up with my code" means querying OTHER sitters' docs, and
// firestore.rules only ever lets a sitter read their own.
export async function fetchMyReferralStats(): Promise<ReferralStats> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, ReferralStats>(functions, 'getMyReferralStats');
  const result = await call();
  return result.data;
}

export type PendingReferralPayout = {
  id: string;
  payeeUid: string;
  payeeName: string;
  payoutMethod: 'venmo' | 'paypal' | null;
  payoutHandle: string | null;
  // 'referrer' — this sitter sent the code. 'referred' — this sitter
  // signed up with someone else's code. Same $15, different reason.
  role: 'referrer' | 'referred';
  amount: number;
  createdAt: string | null;
  dueBy: string | null;
};

// Admin-only (see functions/index.js's isClusterAdmin) — every $15 owed
// and not yet marked paid, for the manual Venmo/PayPal payout queue
// (app/admin/referrals.tsx). Sorted soonest-due first.
export async function fetchPendingReferralPayouts(): Promise<PendingReferralPayout[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, { payouts: PendingReferralPayout[] }>(functions, 'getPendingReferralPayouts');
  const result = await call();
  return result.data.payouts;
}

// The only way a payout's status ever changes — an admin confirming they
// actually sent the Venmo/PayPal payment, same "human does the real
// disbursement, app just tracks it" split as the rest of this feature.
export async function markReferralPayoutPaid(id: string): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ id: string }, void>(functions, 'markReferralPayoutPaid');
  await call({ id });
}
