// Mirrors functions/index.js's CLUSTERS/DEFAULT_CLUSTER_ID/clusterForZip —
// kept in sync manually (same reasoning as lib/superAdmin.ts: this can't
// import a server-only file, and there's no Firestore collection to read
// it from yet). Used client-side to auto-stamp a family's clusterId
// during onboarding (see app/onboarding/family.tsx) without a round trip
// to a Cloud Function for something this cheap to compute locally.
export const CLUSTERS: Record<string, { name: string; admins: string[] }> = {
  'bay-area': { name: 'Bay Area', admins: ['admin@haven-ly.com'] },
};

export const DEFAULT_CLUSTER_ID = 'bay-area';

// Always returns DEFAULT_CLUSTER_ID for now (only one cluster exists) —
// real zip-range/city matching logic goes here once a second cluster
// launches, mirrored from functions/index.js's own clusterForZip.
export function clusterForZip(zip: string): string {
  return DEFAULT_CLUSTER_ID;
}

export function clusterName(clusterId: string | null | undefined): string {
  return (clusterId && CLUSTERS[clusterId]?.name) || CLUSTERS[DEFAULT_CLUSTER_ID].name;
}
