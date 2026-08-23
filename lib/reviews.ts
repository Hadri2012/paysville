import { newId } from "./ids";
import { MAX_REPLY_LENGTH, type Review, type State } from "./types";
import { cleanString } from "./validation";

export interface ReviewSummary {
  /** Moyenne sur 5, arrondie au dixième. `null` s'il n'y a aucun avis publié. */
  average: number | null;
  count: number;
}

/**
 * Insultes et grossièretés, écrites sans accent (le texte est désaccentué avant
 * comparaison). La liste ne contient que des termes réellement injurieux.
 *
 * Un avis négatif n'est pas une vulgarité : « nul », « pourri », « décevant »,
 * « chiant » restent publiés. Un avis retenu à tort est invisible pour son auteur
 * comme pour la boutique, alors qu'une grossièreté qui passe se corrige d'un clic
 * depuis l'administration — le filtre est donc volontairement prudent.
 */
const PROFANITIES = [
  "connard", "connards", "connasse", "connasses", "conard",
  "enculé", "encule", "encules", "enfoire", "enfoires",
  "salope", "salopes", "salaud", "salauds", "pute", "putes",
  "putain", "putains", "ptain", "merde", "merdes", "merdique",
  "bordel", "chiotte", "chiottes", "couille", "couilles",
  "batard", "batards", "nique", "niquer", "ta gueule", "ferme ta gueule",
  "fils de pute", "va te faire",
];

/**
 * Minuscules, accents retirés, tout ce qui n'est pas une lettre remplacé par une
 * espace. Le passage en ASCII est indispensable : en JavaScript, `\b` ne considère
 * pas les lettres accentuées comme des caractères de mot, donc « garçon » testé tel
 * quel ouvrirait une frontière juste avant « con ».
 */
function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function containsProfanity(text: string): boolean {
  const normalized = ` ${normalizeForFilter(text)} `;
  return PROFANITIES.some((word) =>
    normalized.includes(` ${normalizeForFilter(word)} `),
  );
}

function isSpam(author: string, comment: string): boolean {
  const text = `${author} ${comment}`;

  // Contient une insulte ou une grossièreté.
  if (containsProfanity(text)) return true;

  const lowerText = text.toLowerCase();

  // Trop de caractères répétés (ex: "aaaaaaa")
  if (/(.)\1{5,}/.test(lowerText)) return true;

  // Contient "http" ou "https" (liens dans les avis = suspect)
  if (/https?:/.test(lowerText)) return true;

  // Contient du charabia (15+ caractères spéciaux non-accentués consécutifs)
  if (/[!@#$%^&*()_+=\[\]{};':"\\|<>,./?]{15,}/.test(lowerText)) return true;

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

/**
 * L'auteur a-t-il réellement acheté ce produit ?
 *
 * On cherche une commande payée contenant l'article, passée avec cette adresse
 * e-mail. Le paiement suffit : attendre le statut « Livrée » ferait dépendre le
 * badge d'un clic de la boutique dans l'administration, et priverait de badge des
 * acheteurs bien réels. En revanche une commande annulée ou remboursée ne compte
 * pas — l'achat n'a pas tenu.
 */
export function isVerifiedPurchase(
  state: State,
  productId: string,
  email: string,
): boolean {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  return state.orders.some(
    (order) =>
      order.customer.email.trim().toLowerCase() === needle &&
      order.paymentStatus === "paid" &&
      order.status !== "canceled" &&
      order.status !== "refunded" &&
      order.items.some((item) => item.productId === productId),
  );
}

export interface NewReviewInput {
  productId: string;
  author: string;
  rating: number;
  comment: string;
  /**
   * E-mail facultatif, utilisé seulement ici pour décider du badge « achat
   * vérifié ». Il n'est jamais recopié dans l'avis enregistré.
   */
  email?: string;
}

export function createReview(state: State, input: NewReviewInput): Review {
  const review: Review = {
    id: newId(),
    productId: input.productId,
    author: input.author,
    rating: input.rating,
    comment: input.comment,
    flagged: isSpam(input.author, input.comment),
    verified: input.email
      ? isVerifiedPurchase(state, input.productId, input.email)
      : false,
    reply: null,
    helpfulYes: 0,
    helpfulNo: 0,
    createdAt: new Date().toISOString(),
  };
  state.reviews.push(review);
  return review;
}

/** Écrit ou efface la réponse de la boutique (texte vide = suppression). */
export function setReviewReply(review: Review, text: string): void {
  const clean = cleanString(text, MAX_REPLY_LENGTH);
  review.reply = clean ? { text: clean, at: new Date().toISOString() } : null;
}

/** Enregistre un vote d'utilité. Le compteur ne redescend jamais sous zéro. */
export function voteReviewHelpful(review: Review, helpful: boolean): void {
  if (helpful) review.helpfulYes = Math.max(0, review.helpfulYes) + 1;
  else review.helpfulNo = Math.max(0, review.helpfulNo) + 1;
}

export function publicReviewView(review: Review) {
  return {
    id: review.id,
    author: review.author,
    rating: review.rating,
    comment: review.comment,
    verified: review.verified,
    reply: review.reply,
    helpfulYes: review.helpfulYes,
    helpfulNo: review.helpfulNo,
    createdAt: review.createdAt,
  };
}

export type PublicReview = ReturnType<typeof publicReviewView>;
