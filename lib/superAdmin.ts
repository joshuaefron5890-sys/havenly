import { CLUSTERS, DEFAULT_CLUSTER_ID } from './clusters';

// UI-gating only — decides whether to show the compose bar on the
// Community thread for the given cluster. The actual write is protected
// server-side by firestore.rules' matching literal (rules can't import a
// JS constant, so CLUSTERS' admin lists are duplicated there and again in
// functions/index.js's CLUSTERS — all three need to stay in sync).
export function isSuperAdminEmail(email: string | null | undefined, clusterId?: string | null): boolean {
  const cluster = CLUSTERS[clusterId || DEFAULT_CLUSTER_ID];
  return Boolean(email && cluster?.admins.includes(email));
}
