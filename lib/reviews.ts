import { newId } from "./ids";
import {
  MAX_REPLY_LENGTH,
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_BYTES,
  type Review,
  type State,
} from "./types";
import { cleanString, normalizeSearch } from "./validation";

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

/**
 * Photos acceptables : uniquement des images matricielles en data-URI base64, et
 * bornées en nombre comme en poids.
 *
 * Le SVG est refusé alors qu'il l'est pour les visuels produit : une image produit
 * est déposée par la boutique, une photo d'avis par n'importe quel visiteur, et un
 * SVG peut porter du script. Ce qui vient du public entre par la porte étroite.
 */
export function sanitizeReviewPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const photos: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) continue;
    if (raw.length > MAX_REVIEW_PHOTO_BYTES) continue;
    photos.push(raw);
    if (photos.length === MAX_REVIEW_PHOTOS) break;
  }
  return photos;
}

/* -------------------------------------------------------------------------- */
/* Points les plus cités                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mots vides : uniquement de la grammaire, plus quelques noms si généraux qu'ils
 * ne distinguent rien (« produit », « article »). Tout le reste est conservé —
 * « finition », « livraison », « solide », « prix » sont précisément le signal
 * recherché, et les écarter viderait le résumé de sa substance.
 */
const STOPWORDS = new Set([
  "avec", "sans", "pour", "dans", "chez", "sous", "vers", "entre", "depuis",
  "mais", "donc", "alors", "aussi", "ainsi", "comme", "quand", "dont", "parce",
  "très", "tres", "plus", "moins", "trop", "assez", "peut", "peux", "bien",
  "tout", "tous", "toute", "toutes", "meme", "même", "autre", "autres",
  "cette", "celui", "celle", "ceux", "cela", "ceci", "elle", "elles", "nous",
  "vous", "leur", "leurs", "notre", "votre", "mon", "son", "ses", "mes",
  "etre", "être", "sont", "etait", "était", "etais", "avoir", "avais", "avait",
  "fait", "faire", "suis", "sera", "serait", "aurait", "avez", "avons",
  "encore", "deja", "déjà", "jamais", "toujours", "vraiment", "juste",
  "plutot", "plutôt", "beaucoup", "quelque", "quelques", "chaque", "aucun",
  "apres", "après", "avant", "pendant", "lorsque", "puisque",
  "produit", "produits", "article", "articles", "chose", "choses", "truc",
  "avis", "objet", "objets", "cest", "jai", "rien", "quil", "quelle",
]);

/** En dessous, la répétition ne prouve rien : on n'affiche pas de résumé. */
export const MIN_REVIEWS_FOR_THEMES = 3;
/** Un mot doit revenir dans au moins deux avis distincts pour être cité. */
const MIN_REVIEWS_PER_THEME = 2;
const MAX_THEMES = 6;

/**
 * Pluriel simple. Le seuil de longueur évite d'amputer « prix », « avis » ou
 * « colis », dont le « s » fait partie du mot.
 */
function stemKey(word: string): string {
  return word.length >= 6 && word.endsWith("s") ? word.slice(0, -1) : word;
}

export interface ReviewTheme {
  /** Le mot tel que les clients l'écrivent le plus souvent. */
  label: string;
  /** Nombre d'avis distincts qui l'emploient. */
  reviews: number;
}

/**
 * Points revenant le plus souvent dans les avis, par simple comptage.
 *
 * On compte des **avis distincts**, pas des occurrences : un client enthousiaste
 * qui écrit « solide » quatre fois ne fabrique pas un consensus. Les variantes d'un
 * même mot sont regroupées, et c'est la forme la plus employée qui s'affiche.
 *
 * Le résumé reste muet tant qu'il n'y a pas de quoi le fonder — trois avis au
 * minimum, deux mentions par mot. Mieux vaut ne rien dire qu'annoncer une tendance
 * tirée d'un seul commentaire.
 */
export function frequentThemes(reviews: Review[], exclude = ""): ReviewTheme[] {
  if (reviews.length < MIN_REVIEWS_FOR_THEMES) return [];

  // Le nom du produit revient dans presque tous les avis : le citer comme « point
  // souvent mentionné » n'apprendrait rien.
  const excluded = new Set(
    normalizeSearch(exclude).split(" ").filter(Boolean).map(stemKey),
  );

  const groups = new Map<string, { seen: Set<string>; forms: Map<string, number> }>();
  for (const review of reviews) {
    for (const word of normalizeSearch(review.comment).split(" ")) {
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      const key = stemKey(word);
      if (excluded.has(key)) continue;
      let group = groups.get(key);
      if (!group) {
        group = { seen: new Set(), forms: new Map() };
        groups.set(key, group);
      }
      group.seen.add(review.id);
      group.forms.set(word, (group.forms.get(word) ?? 0) + 1);
    }
  }

  return [...groups.values()]
    .filter((group) => group.seen.size >= MIN_REVIEWS_PER_THEME)
    .map((group) => ({
      label: [...group.forms.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"),
      )[0][0],
      reviews: group.seen.size,
    }))
    .sort((a, b) => b.reviews - a.reviews || a.label.localeCompare(b.label, "fr"))
    .slice(0, MAX_THEMES);
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
  photos?: string[];
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
    photos: sanitizeReviewPhotos(input.photos),
    reports: 0,
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

/**
 * Signalement par un visiteur. Volontairement sans effet automatique : un avis
 * légitime mais dérangeant serait sinon retirable par quiconque insiste. Le
 * compteur ne fait que remonter l'avis dans la file de l'administration.
 */
export function reportReview(review: Review): void {
  review.reports = Math.max(0, review.reports) + 1;
}

/** Signalements traités : la boutique a regardé et ne retient rien. */
export function clearReviewReports(review: Review): void {
  review.reports = 0;
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
    photos: review.photos,
    createdAt: review.createdAt,
  };
}

export type PublicReview = ReturnType<typeof publicReviewView>;
