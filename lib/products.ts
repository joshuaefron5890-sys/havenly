import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type RecommendedProduct = {
  url: string;
  title: string;
  vendor: string;
  source: string;
  imageUrl: string | null;
  description: string;
  matchedTags: string[];
};

// Products matching the signed-in user's child's neurodivergence tags —
// fetched server-side (functions/index.js getRecommendedProducts), which
// reads those tags from the caller's own Firestore doc and searches
// ND-specialty retailers (Fun and Function, Harkla) on their behalf.
export async function fetchRecommendedProducts(): Promise<RecommendedProduct[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { products: RecommendedProduct[] }>(functions, 'getRecommendedProducts');
  const result = await call();
  return result.data.products;
}

export function productSubtitle(product: RecommendedProduct): string {
  const matches = product.matchedTags.length ? `Matches ${product.matchedTags.join(', ')}` : '';
  return [product.source, matches].filter(Boolean).join(' · ');
}
