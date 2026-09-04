import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type TestDataStatus = {
  familyCount: number;
  sitterCount: number;
};

// Current count of seeded test families/sitters (functions/index.js's
// countTestData) — admin-only, same as generate/delete below.
export async function getTestDataStatus(): Promise<TestDataStatus> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, TestDataStatus>(functions, 'getTestDataStatus');
  const result = await call();
  return result.data;
}

// Creates (or reshuffles, if already present) a fixed batch of fake
// families/sitters tagged isTestData: true — see functions/index.js's own
// comment on generateTestData for why there's no separate on/off switch:
// this data is only ever visible to a cluster admin, never a real family.
export async function generateTestData(): Promise<TestDataStatus> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, TestDataStatus>(functions, 'generateTestData');
  const result = await call();
  return result.data;
}

export async function deleteTestData(): Promise<TestDataStatus> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, TestDataStatus>(functions, 'deleteTestData');
  const result = await call();
  return result.data;
}
