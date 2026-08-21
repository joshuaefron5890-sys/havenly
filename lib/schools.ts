import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type NearbySchool = {
  id: string;
  name: string;
  city: string;
  state: string;
  level: string;
  distanceMiles: number;
};

// Schools within 20 miles of a zip code — fetched server-side
// (functions/index.js getNearbySchools), which pulls the state's public
// school directory from the Urban Institute's Education Data Portal and
// filters/sorts by distance. Defaults to the signed-in family's own zip
// when none is passed.
export async function fetchNearbySchools(zip?: string): Promise<NearbySchool[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ zip?: string }, { schools: NearbySchool[] }>(functions, 'getNearbySchools');
  const result = await call(zip ? { zip } : {});
  return result.data.schools;
}

export function schoolSubtitle(school: NearbySchool): string {
  return [school.level, `${school.distanceMiles} mi`].filter(Boolean).join(' · ');
}
