import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type HealthResource = {
  url: string;
  title: string;
  snippet: string;
  matchedTags: string[];
};

// Health topic resources matching the signed-in user's child's
// neurodivergence tags — fetched server-side (functions/index.js
// getHealthResources), which reads those tags from the caller's own
// Firestore doc and searches the National Library of Medicine's
// MedlinePlus Web Service on their behalf. Per MedlinePlus's terms,
// results shown to users must be attributed to MedlinePlus — see
// resourceSubtitle().
export async function fetchHealthResources(): Promise<HealthResource[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { resources: HealthResource[] }>(functions, 'getHealthResources');
  const result = await call();
  return result.data.resources;
}

export function resourceSubtitle(resource: HealthResource): string {
  return `MedlinePlus · ${resource.snippet}`;
}
