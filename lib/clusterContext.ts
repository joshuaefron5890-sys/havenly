import { DEFAULT_CLUSTER_ID } from './clusters';

// The signed-in family's clusterId (see lib/clusters.ts) — resolved once
// by AuthContext alongside familyUid (see lib/familyContext.ts's own
// comment for why a cache rather than React context: several lib/*.ts
// functions need this synchronously, with no component tree to read
// context from). Community messages are the first consumer; anything else
// that needs to know "which metro-level community is this family in"
// without a component-level useOnboarding() read can use this too.
let cachedClusterId: string | null = null;

export function setCachedClusterId(clusterId: string | null): void {
  cachedClusterId = clusterId;
}

// Falls back to the single default cluster until AuthContext's
// resolution completes, or for a family whose own users/{uid} doc simply
// has no clusterId on file yet (onboarded before clusters existed) — same
// fallback functions/index.js's clusterIdOf applies server-side.
export function getMyClusterId(): string {
  return cachedClusterId ?? DEFAULT_CLUSTER_ID;
}
