import { newId } from "./ids";
import type { Review, State } from "./types";

export interface ReviewSummary {
  /** Moyenne sur 5, arrondie au dixième. `null` s'il n'y a aucun avis publié. */
  average: number | null;
  count: number;
}

function isSpam(author: string, comment: string): boolean {
  const text = (author + " " + comment).toLowerCase();

  // Trop de caractères répétés (ex: "aaaaaaa")
  if (/(.)\1{5,}/.test(text)) return true;

  // Contient "http" ou "https" (liens dans les avis = suspect)
  if (/https?:/.test(text)) return true;

  // Contient du charabia (15+ caractères spéciaux non-accentués consécutifs)
  if (/[!@#$%^&*()_+=\[\]{};':"\\|<>,./?]{15,}/.test(text)) return true;

  return false;
}

export function approvedReviews(state: State, productId: string): Review[] {
  return state.reviews
    .filter((r) => r.productId === productId && !r.flagged)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function summarize(reviews: Review[]): ReviewSummary {
  if (reviews.length === 0) return { average: null, count: 0 };
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return {
    average: Math.round((total / reviews.length) * 10) / 10,
    count: reviews.length,
  };
}

export function reviewSummary(state: State, productId: string): ReviewSummary {
  return summarize(approvedReviews(state, productId));
}

export function reviewSummaries(state: State): Map<string, ReviewSummary> {
  const grouped = new Map<string, Review[]>();
  for (const review of state.reviews) {
    if (review.flagged) continue;
    const list = grouped.get(review.productId);
    if (list) list.push(review);
    else grouped.set(review.productId, [review]);
  }
  const summaries = new Map<string, ReviewSummary>();
  for (const [productId, list] of grouped) {
    summaries.set(productId, summarize(list));
  }
  return summaries;
}

export interface NewReviewInput {
  productId: string;
  author: string;
  rating: number;
  comment: string;
}

export function createReview(state: State, input: NewReviewInput): Review {
  const review: Review = {
    id: newId(),
    productId: input.productId,
    author: input.author,
    rating: input.rating,
    comment: input.comment,
    flagged: isSpam(input.author, input.comment),
    createdAt: new Date().toISOString(),
  };
  state.reviews.push(review);
  return review;
}

export function publicReviewView(review: Review) {
  return {
    id: review.id,
    author: review.author,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

export type PublicReview = ReturnType<typeof publicReviewView>;
