// Family info is followed by up to two optional per-person loops — one
// screen per neurodivergent child, then one screen per sibling — before
// getting to play style. Either (or both) can be skipped if the relevant
// count is zero. Centralized here since family, child, siblings, and
// play-style all need to agree on where "next" and "back" actually go.
type ChildCounts = { numChildren: number; numNeurodivergentChildren: number };

export function numSiblings({ numChildren, numNeurodivergentChildren }: ChildCounts): number {
  return Math.max(0, numChildren - numNeurodivergentChildren);
}

export function stepAfterFamily(counts: ChildCounts): string {
  if (counts.numNeurodivergentChildren > 0) return '/onboarding/child';
  if (numSiblings(counts) > 0) return '/onboarding/siblings';
  return '/onboarding/play-style';
}

export function stepAfterChild(counts: ChildCounts): string {
  return numSiblings(counts) > 0 ? '/onboarding/siblings' : '/onboarding/play-style';
}

export function stepBeforeSiblings(counts: ChildCounts): string {
  return counts.numNeurodivergentChildren > 0 ? '/onboarding/child' : '/onboarding/family';
}

export function stepBeforePlayStyle(counts: ChildCounts): string {
  if (numSiblings(counts) > 0) return '/onboarding/siblings';
  if (counts.numNeurodivergentChildren > 0) return '/onboarding/child';
  return '/onboarding/family';
}
