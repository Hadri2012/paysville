/**
 * Journal des nouveautés du site (page `/nouveautes`).
 *
 * Chaque mise en ligne y est décrite en français courant, avec son horodatage :
 * la page affiche ce qui a changé, quand, du plus récent au plus ancien.
 *
 * C'est aussi le moyen le plus simple de vérifier qu'un déploiement est bien
 * arrivé jusqu'au site : si la dernière entrée n'apparaît pas en ligne, c'est
 * que la version publiée est plus ancienne que le code.
 *
 * Les horodatages sont écrits en UTC (suffixe `Z`) et affichés à l'heure de
 * Bruxelles, comme les dates de commande ailleurs dans la boutique.
 */

export type ChangeKind = "nouveaute" | "amelioration" | "correctif";

export interface ChangelogEntry {
  /** Horodatage ISO 8601, en UTC. */
  at: string;
  kind: ChangeKind;
  title: string;
  details: string;
  /** Précisions listées sous la description, quand une seule phrase ne suffit pas. */
  bullets?: string[];
}

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  nouveaute: "Nouveauté",
  amelioration: "Amélioration",
  correctif: "Correctif",
};

/** Classe de badge réutilisée depuis la feuille de style commune. */
export const CHANGE_KIND_BADGES: Record<ChangeKind, string> = {
  nouveaute: "badge-success",
  amelioration: "badge-info",
  correctif: "badge-warning",
};

/**
 * Les entrées, de la plus récente à la plus ancienne. L'ordre est de toute façon
 * recalculé à l'affichage : ajouter une entrée en tête suffit, sans risque.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    at: "2026-08-23T20:25:00Z",
    kind: "correctif",
    title: "Un code promo à usage unique pouvait être réutilisé",
    details:
      "Le code de bienvenue (une remise par client) pouvait être appliqué plusieurs fois par la même personne en ouvrant deux commandes sans attendre la fin du paiement de la première. Un audit ciblé a reproduit puis corrigé la faille : la commande la plus récente compte désormais dès sa création, le temps de son paiement, exactement comme le stock est déjà réservé.",
  },
  {
    at: "2026-08-23T20:12:00Z",
    kind: "correctif",
    title: "Trois bugs corrigés : panier, code promo, réservation de stock",
    details:
      "Un second audit a trouvé trois nouvelles anomalies, corrigées et verrouillées par de nouveaux tests automatiques.",
    bullets: [
      "Le panier n'était jamais vidé après un paiement réussi : les articles déjà achetés restaient affichés, prêts à être recommandés par erreur.",
      "Un code promo à nombre d'utilisations limité restait consommé par une commande finalement annulée ou remboursée, au lieu de redevenir utilisable.",
      "La réservation de stock pouvait expirer avant la session de paiement Stripe qui lui correspond, risquant une survente si le client payait dans cette fenêtre.",
    ],
  },
  {
    at: "2026-08-23T19:47:00Z",
    kind: "correctif",
    title: "Quatre bugs corrigés : livraison, remboursement, adresse",
    details:
      "Un audit du code a révélé plusieurs anomalies discrètes, corrigées et verrouillées par de nouveaux tests automatiques.",
    bullets: [
      "Une zone de livraison désactivée par l'admin, ou restreinte à certaines communes, pouvait quand même accepter des commandes via le calcul automatique par distance.",
      "Un remboursement fait depuis Stripe (plutôt que depuis l'administration) ne remettait pas le stock en rayon.",
      "Un remboursement partiel (ex. un avoir sur les frais de port) clôturait toute la commande et coupait l'accès aux fichiers déjà payés, comme un remboursement total.",
      "Modifier son adresse depuis le suivi de commande faisait disparaître, à l'écran seulement, les liens de téléchargement des fichiers déjà payés.",
    ],
  },
  {
    at: "2026-08-23T18:21:00Z",
    kind: "amelioration",
    title: "Bouton « Modifier » plus visible sur le suivi de commande",
    details:
      "Le bouton qui permet de changer l'adresse de livraison n'était qu'un petit crayon, difficile à repérer. Il affiche désormais le mot « Modifier » à côté du crayon, dans un bouton plus large.",
  },
  {
    at: "2026-08-23T17:34:00Z",
    kind: "correctif",
    title: "Contrôle de la zone de livraison lors d'un changement d'adresse",
    details:
      "Une commande pouvait être redirigée vers une adresse que la boutique ne dessert pas, ou dont les frais de port diffèrent de ceux déjà réglés. La nouvelle adresse est maintenant vérifiée comme au moment de la commande.",
    bullets: [
      "Adresse hors zone : la modification est refusée avec un message clair.",
      "Frais de livraison différents : la modification est refusée et invite à nous contacter.",
      "Commande composée uniquement de fichiers : l'adresse reste facultative, elle ne sert qu'à la facturation.",
    ],
  },
  {
    at: "2026-08-23T16:50:00Z",
    kind: "amelioration",
    title: "Sélecteur de quantité adapté au tactile",
    details:
      "Sur téléphone, les boutons « + » et « − » du panier passent à 44 pixels de côté : la taille recommandée pour être touchés du doigt sans se tromper.",
  },
  {
    at: "2026-08-23T16:44:00Z",
    kind: "correctif",
    title: "Sélecteur de quantité qui s'étirait sur toute la largeur",
    details:
      "Le sélecteur de quantité occupait toute la largeur disponible au lieu de s'ajuster à son contenu. Il garde désormais sa taille naturelle.",
  },
  {
    at: "2026-08-23T15:39:00Z",
    kind: "nouveaute",
    title: "Modifier son adresse de livraison depuis le suivi de commande",
    details:
      "Une erreur dans l'adresse ne demande plus de nous écrire : depuis la page de suivi, un bouton permet de la corriger soi-même, tant que la commande n'est pas partie.",
    bullets: [
      "Possible tant que la commande est en attente de paiement, payée, en préparation ou prête.",
      "Plus possible une fois la commande expédiée, livrée, annulée ou remboursée.",
    ],
  },
  {
    at: "2026-08-23T12:58:00Z",
    kind: "nouveaute",
    title: "Vente de fichiers numériques et aperçu 3D",
    details:
      "La boutique vend désormais des fichiers (modèles 3D, documents, archives) en plus des objets imprimés, et les fiches produits peuvent afficher un aperçu 3D manipulable.",
    bullets: [
      "Téléchargement immédiat dès la confirmation du paiement, sans création de compte.",
      "Fichiers retrouvables à tout moment depuis le suivi de commande.",
      "Aucun frais de livraison sur une commande composée uniquement de fichiers.",
    ],
  },
  {
    at: "2026-08-23T11:55:00Z",
    kind: "nouveaute",
    title: "Sept ajouts sur la boutique et les avis",
    details:
      "Une série d'améliorations destinées à mieux s'y retrouver dans le catalogue et dans les avis.",
    bullets: [
      "Tri par « meilleures ventes ».",
      "Section « Nouveautés » sur la page d'accueil.",
      "Suggestions « Complétez votre panier ».",
      "Codes promotionnels utilisables une seule fois par client.",
      "Signalement d'un avis problématique.",
      "Photos jointes aux avis.",
      "Résumé des points les plus cités par les clients.",
    ],
  },
  {
    at: "2026-08-23T11:26:00Z",
    kind: "amelioration",
    title: "Avis clients enrichis et suivi de commande détaillé",
    details:
      "Les avis acceptent une réponse de la boutique, affichent un badge « achat vérifié » et un vote d'utilité. Le suivi de commande montre le parcours complet, étape par étape.",
  },
  {
    at: "2026-08-23T10:30:00Z",
    kind: "correctif",
    title: "Filtre anti-spam trop strict sur les avis",
    details:
      "Le filtre automatique bloquait des avis parfaitement légitimes à cause de mots contenus dans d'autres mots. Il ne se déclenche plus que sur des mots entiers.",
  },
  {
    at: "2026-08-22T19:47:00Z",
    kind: "nouveaute",
    title: "Recherche, tri, avis clients et favoris",
    details:
      "La boutique se parcourt par recherche et par tri, chaque produit accepte des avis, et une liste de favoris permet de garder de côté ce qui vous intéresse.",
  },
  {
    at: "2026-08-22T17:32:00Z",
    kind: "correctif",
    title: "Panier limité au stock réellement disponible",
    details:
      "Il était possible d'ajouter au panier plus d'exemplaires qu'il n'en restait, l'erreur n'apparaissant qu'au paiement. La limite s'applique maintenant dès l'ajout.",
  },
  {
    at: "2026-08-22T16:02:00Z",
    kind: "nouveaute",
    title: "Livraison calculée à la distance, jusqu'à Gembloux",
    details:
      "La zone desservie s'étend à 30 km autour de l'atelier : les frais sont calculés selon la distance, et les communes couvertes sont listées sur la page Livraison.",
  },
  {
    at: "2026-08-22T14:47:00Z",
    kind: "amelioration",
    title: "Mise à jour de sécurité du site",
    details:
      "Passage à une version récente du moteur du site, qui corrige une vulnérabilité critique.",
  },
];

const TIME_ZONE = "Europe/Brussels";

/**
 * Clé de regroupement : le jour tel qu'il est vécu à Bruxelles, et non en UTC.
 * Sans cela, une mise en ligne de fin de soirée serait rangée le lendemain.
 * Le format `en-CA` donne directement `AAAA-MM-JJ`.
 */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** « Dimanche 23 août 2026 » */
export function formatChangeDay(iso: string): string {
  const label = new Date(iso).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « 20:21 » */
export function formatChangeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-BE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

export interface ChangelogDay {
  key: string;
  label: string;
  entries: ChangelogEntry[];
}

/** Regroupe les entrées par journée, les plus récentes d'abord. */
export function changelogByDay(entries: ChangelogEntry[] = CHANGELOG): ChangelogDay[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const days = new Map<string, ChangelogDay>();

  for (const entry of sorted) {
    const key = dayKey(entry.at);
    const day = days.get(key);
    if (day) {
      day.entries.push(entry);
    } else {
      days.set(key, { key, label: formatChangeDay(entry.at), entries: [entry] });
    }
  }

  return [...days.values()];
}

export interface DeployedVersion {
  /** Empreinte courte du code publié, `null` hors déploiement. */
  commit: string | null;
  branch: string | null;
  /** Vrai quand le site tourne sur une machine de développement. */
  local: boolean;
}

/**
 * Repère de la version en ligne, lu dans les variables fournies par l'hébergeur.
 * Il permet de comparer d'un coup d'œil ce qui tourne avec ce qui a été poussé —
 * la question qui a motivé cette page.
 */
export function deployedVersion(): DeployedVersion {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    commit: sha ? sha.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    local: !process.env.VERCEL,
  };
}
