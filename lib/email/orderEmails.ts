import { isDigitalOnly } from "../digital";
import { formatPrice } from "../money";
import {
  ORDER_FLOW,
  ORDER_STATUS_DESCRIPTIONS,
  isCashConfirmationStep,
  isStoppedStatus,
} from "../orderFlow";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus, type Settings } from "../types";
import { FONT, PALETTE, button, divider, esc, panel, sectionTitle, shell } from "./layout";
import type { EmailMessage } from "./transport";

/**
 * Contenu des e-mails de suivi de commande.
 *
 * Un message par étape franchie. Les phrases viennent de `lib/orderFlow.ts`,
 * partagé avec la frise du site : le client lit la même chose des deux côtés.
 *
 * Aucune image n'est utilisée. Les visuels produit de la boutique sont souvent
 * des `data:` (voir `lib/images.ts`), que Gmail et consorts refusent d'afficher ;
 * un message reposant dessus arriverait troué. La mise en valeur passe donc par
 * la typographie et la couleur, qui, elles, s'affichent partout.
 */

/** Étapes qui déclenchent un e-mail. Les autres passent en silence. */
export const NOTIFIED_STATUSES: OrderStatus[] = [
  "paid",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "canceled",
  "refunded",
];

export function isNotifiedStatus(status: OrderStatus): boolean {
  return NOTIFIED_STATUSES.includes(status);
}

/** Objet du message, par étape. */
const SUBJECTS: Record<OrderStatus, (number: string) => string> = {
  awaiting_payment: (n) => `Commande ${n} enregistrée`,
  paid: (n) => `Merci ! Votre commande ${n} est confirmée`,
  preparing: (n) => `Votre commande ${n} est en préparation`,
  ready: (n) => `Votre commande ${n} est prête`,
  shipped: (n) => `Votre commande ${n} est en route`,
  delivered: (n) => `Votre commande ${n} vous a été remise`,
  canceled: (n) => `Votre commande ${n} a été annulée`,
  refunded: (n) => `Votre commande ${n} a été remboursée`,
};

/** Titre affiché en tête du message. Plus chaleureux que le nom du statut. */
const HEADLINES: Record<OrderStatus, string> = {
  awaiting_payment: "Commande enregistrée",
  paid: "Merci pour votre commande !",
  preparing: "C'est parti pour l'impression",
  ready: "Votre commande est prête",
  shipped: "Votre colis est en route",
  delivered: "Votre commande est arrivée",
  canceled: "Votre commande a été annulée",
  refunded: "Votre remboursement est effectué",
};

function statusTone(status: OrderStatus): { bg: string; fg: string } {
  if (isStoppedStatus(status)) return { bg: PALETTE.dangerSoft, fg: PALETTE.danger };
  if (status === "delivered" || status === "paid") {
    return { bg: PALETTE.successSoft, fg: PALETTE.success };
  }
  return { bg: PALETTE.accentSoft, fg: PALETTE.accent };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
}

/* -------------------------------------------------------------------------- */
/* Frise de progression                                                       */
/* -------------------------------------------------------------------------- */

/** Libellés courts : « Paiement confirmé » ne tient pas sous une pastille. */
const SHORT_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Confirmée",
  preparing: "Préparation",
  ready: "Prête",
  shipped: "Expédiée",
  delivered: "Livrée",
};

/**
 * Frise en quatre à cinq pastilles reliées.
 *
 * Construite en cellules de tableau : un rond coloré par étape, un trait entre
 * deux. Outlook n'arrondit pas les angles et affichera de petits carrés — la
 * lecture reste la même, ce qui est le seuil acceptable pour une décoration.
 *
 * Une commande annulée ou remboursée n'a pas de parcours à montrer : promettre
 * une livraison qui n'arrivera pas serait pire que de ne rien afficher.
 */
function progress(status: OrderStatus): string {
  if (isStoppedStatus(status)) return "";

  // « En attente de paiement » n'apparaît pas : à ce stade aucun e-mail n'est
  // parti, la frise commencerait donc toujours par une étape déjà franchie.
  const steps: OrderStatus[] = ORDER_FLOW.filter((step) => step !== "awaiting_payment");
  const currentIndex = steps.indexOf(status);
  if (currentIndex < 0) return "";

  // Deux rangées plutôt qu'une : les pastilles d'abord, les libellés dessous.
  // Sur une seule rangée, le trait de liaison se centre sur l'ensemble
  // « pastille + libellé » et passe donc sous les pastilles au lieu de les
  // relier.
  const dots: string[] = [];
  const labels: string[] = [];

  steps.forEach((step, index) => {
    const done = index <= currentIndex;
    const isCurrent = index === currentIndex;
    const size = isCurrent ? 14 : 10;

    if (index > 0) {
      const lineColor = index <= currentIndex ? PALETTE.brand : PALETTE.line;
      dots.push(
        `<td valign="middle" style="padding:0 4px;"><div style="height:2px;line-height:2px;font-size:0;background-color:${lineColor};">&nbsp;</div></td>`,
      );
      labels.push(`<td>&nbsp;</td>`);
    }

    dots.push(`
<td width="62" align="center" valign="middle" style="width:62px;height:16px;">
  <div style="width:${size}px;height:${size}px;line-height:${size}px;font-size:0;border-radius:50%;background-color:${
    done ? PALETTE.brand : PALETTE.lineStrong
  };margin:0 auto;">&nbsp;</div>
</td>`);

    labels.push(`
<td width="62" align="center" valign="top" style="width:62px;padding-top:9px;font-family:${FONT};font-size:11px;font-weight:${
      isCurrent ? 700 : 500
    };color:${done ? PALETTE.ink2 : PALETTE.muted};white-space:nowrap;" class="${
      done ? "ink-2" : "muted"
    }">${esc(SHORT_LABELS[step] ?? ORDER_STATUS_LABELS[step])}</td>`);
  });

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 30px;">
  <tr>${dots.join("")}</tr>
  <tr>${labels.join("")}</tr>
</table>`;
}

/* -------------------------------------------------------------------------- */
/* Récapitulatif                                                              */
/* -------------------------------------------------------------------------- */

function itemsTable(order: Order): string {
  const rows = order.items
    .map(
      (item) => `
<tr>
  <td style="padding:12px 0;border-bottom:1px solid ${PALETTE.line};font-family:${FONT};font-size:14px;color:${PALETTE.ink};">
    <span class="ink" style="font-weight:600;color:${PALETTE.ink};">${esc(item.name)}</span>
    ${
      item.kind === "digital"
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:20px;background-color:${PALETTE.brandSoft};font-size:10px;font-weight:700;color:${PALETTE.brand};text-transform:uppercase;letter-spacing:0.04em;">Fichier</span>`
        : ""
    }
    <div class="muted" style="margin-top:3px;font-size:12px;color:${PALETTE.muted};">
      ${esc(item.sku)} &middot; ${item.quantity} × ${esc(formatPrice(item.unitPriceCents, order.currency))}
    </div>
  </td>
  <td class="num-right" align="right" valign="top" style="padding:12px 0;border-bottom:1px solid ${PALETTE.line};font-family:${FONT};font-size:14px;font-weight:600;color:${PALETTE.ink};white-space:nowrap;">
    ${esc(formatPrice(item.lineTotalCents, order.currency))}
  </td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

function totalsTable(order: Order): string {
  const digitalOnly = isDigitalOnly(order.items);

  const row = (label: string, value: string, strong = false, color: string = PALETTE.ink2) => `
<tr>
  <td style="padding:5px 0;font-family:${FONT};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 700 : 400};color:${strong ? PALETTE.ink : color};">${esc(label)}</td>
  <td align="right" style="padding:5px 0;font-family:${FONT};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 700 : 600};color:${strong ? PALETTE.ink : color};white-space:nowrap;">${esc(value)}</td>
</tr>`;

  const shippingValue = digitalOnly
    ? "Téléchargement"
    : order.shippingCents > 0
      ? formatPrice(order.shippingCents, order.currency)
      : "Offerte";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
  ${row("Sous-total", formatPrice(order.subtotalCents, order.currency))}
  ${
    order.discountCents > 0
      ? row(
          `Remise${order.promoCode ? ` (${order.promoCode})` : ""}`,
          `− ${formatPrice(order.discountCents, order.currency)}`,
          false,
          PALETTE.success,
        )
      : ""
  }
  ${row(digitalOnly ? "Livraison" : "Livraison", shippingValue)}
  <tr><td colspan="2" style="padding-top:10px;"><div style="height:1px;line-height:1px;font-size:0;background-color:${PALETTE.line};">&nbsp;</div></td></tr>
  ${row("Total", formatPrice(order.totalCents, order.currency), true)}
</table>`;
}

function addressBlock(order: Order): string {
  const digitalOnly = isDigitalOnly(order.items);
  const { address, customer } = order;
  const hasAddress = Boolean(address.street || address.city || address.postalCode);

  // Une commande entièrement numérique n'a pas d'adresse obligatoire : ne rien
  // afficher vaut mieux qu'un bloc vide sous un titre « Livraison ».
  if (digitalOnly && !hasAddress) return "";

  const lines = [
    `${customer.firstName} ${customer.lastName}`,
    [address.street, address.streetNumber].filter(Boolean).join(" "),
    address.complement,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ].filter((line) => line && line.trim());

  return `
${divider()}
${sectionTitle(digitalOnly ? "Facturation" : "Adresse de livraison")}
${panel(lines.map((line) => esc(line)).join("<br />"))}`;
}

/** Rappel des fichiers achetés, sans lien direct : ils vivent dans le suivi. */
function downloadsBlock(order: Order, trackUrl: string): string {
  const files = order.items.filter((item) => item.kind === "digital");
  if (files.length === 0 || order.paymentStatus !== "paid") return "";
  if (isStoppedStatus(order.status)) return "";

  return `
${divider()}
${sectionTitle("Vos fichiers")}
${panel(
  `<strong style="color:${PALETTE.ink};">${files.length} fichier${files.length > 1 ? "s" : ""} vous ${files.length > 1 ? "attendent" : "attend"}.</strong><br />
   Retrouvez-${files.length > 1 ? "les" : "le"} à tout moment depuis le suivi de votre commande, autant de fois que nécessaire.
   <div style="margin-top:14px;"><a href="${esc(trackUrl)}" style="color:${PALETTE.brand};font-weight:600;text-decoration:underline;">Accéder à mes fichiers</a></div>`,
  "brand",
)}`;
}

/**
 * Rappel du montant à préparer en espèces, tant que la commande en espèces
 * n'est pas livrée. Affiché à chaque étape et pas seulement à la confirmation :
 * c'est l'information qu'un client relit juste avant que le livreur ne sonne,
 * pas seulement le jour de la commande.
 */
function cashReminder(order: Order): string {
  if (order.paymentMethod !== "cash_on_delivery") return "";
  if (isStoppedStatus(order.status) || order.status === "delivered") return "";

  return `
${divider()}
${panel(
  `<strong style="color:${PALETTE.ink};">À régler à la livraison :</strong> ${esc(
    formatPrice(order.totalCents, order.currency),
  )} en espèces, remis en main propre au livreur.`,
  "warn",
)}`;
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Phrase d'accroche propre à l'étape, sous le titre. Elle reprend la
 * description partagée avec le site, complétée quand l'étape mérite une
 * précision que la frise ne donne pas.
 */
function intro(order: Order, status: OrderStatus): string {
  if (isCashConfirmationStep(status, order.paymentMethod, order.statusHistory)) {
    return `Votre commande est confirmée et va être préparée. Prévoyez ${formatPrice(
      order.totalCents,
      order.currency,
    )} en espèces pour la livraison : c'est le seul règlement demandé, rien n'est prélevé en ligne.`;
  }
  const base = ORDER_STATUS_DESCRIPTIONS[status];
  if (status === "paid") {
    return isDigitalOnly(order.items)
      ? "Paiement reçu, votre commande est confirmée. Vos fichiers sont dès maintenant téléchargeables."
      : `${base} Nous vous préviendrons à chaque étape jusqu'à la livraison.`;
  }
  if (status === "refunded") {
    return `${base} Selon votre banque, le montant peut mettre quelques jours à réapparaître sur votre compte.`;
  }
  return base;
}

/** Titre et objet, adaptés quand cette étape joue le rôle de confirmation de
 * commande pour un règlement en espèces (voir `intro` ci-dessus). */
function headline(order: Order, status: OrderStatus): string {
  if (isCashConfirmationStep(status, order.paymentMethod, order.statusHistory)) {
    return "Commande confirmée !";
  }
  return HEADLINES[status];
}

function subject(order: Order, status: OrderStatus): string {
  if (isCashConfirmationStep(status, order.paymentMethod, order.statusHistory)) {
    return `Merci ! Votre commande ${order.number} est confirmée`;
  }
  return SUBJECTS[status](order.number);
}

export interface OrderEmailContext {
  order: Order;
  settings: Settings;
  siteUrl: string;
  /** Note saisie par la boutique pour ce changement d'état, le cas échéant. */
  note?: string;
}

export function renderOrderEmail(
  { order, settings, siteUrl, note }: OrderEmailContext,
  status: OrderStatus = order.status,
): EmailMessage {
  const trackUrl = `${siteUrl}/suivi`;
  const tone = statusTone(status);
  const headlineText = headline(order, status);
  const introText = intro(order, status);

  const body = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr>
    <td style="background-color:${tone.bg};border-radius:20px;padding:6px 14px;font-family:${FONT};font-size:12px;font-weight:700;color:${tone.fg};letter-spacing:0.02em;">
      ${esc(
        isCashConfirmationStep(status, order.paymentMethod, order.statusHistory)
          ? "Commande confirmée"
          : ORDER_STATUS_LABELS[status],
      )}
    </td>
  </tr>
</table>

<h1 class="h1 ink" style="margin:0 0 10px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:800;color:${PALETTE.ink};letter-spacing:-0.02em;">
  ${esc(headlineText)}
</h1>

<p class="ink-2" style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.65;color:${PALETTE.ink2};">
  Bonjour ${esc(order.customer.firstName)},
</p>
<p class="ink-2" style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.65;color:${PALETTE.ink2};">
  ${esc(introText)}
</p>

${progress(status)}

${
  note
    ? `<div style="margin:0 0 24px;">${panel(`<strong style="color:${PALETTE.ink};">Message de la boutique</strong><br />${esc(note)}`, "warn")}</div>`
    : ""
}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
  <tr><td align="center">${button(trackUrl, "Suivre ma commande")}</td></tr>
</table>

${divider()}

${sectionTitle("Récapitulatif")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
  <tr>
    <td class="stack-cell" style="font-family:${FONT};font-size:15px;font-weight:700;color:${PALETTE.ink};letter-spacing:0.01em;">
      ${esc(order.number)}
    </td>
    <td class="stack-cell num-right" align="right" style="font-family:${FONT};font-size:13px;color:${PALETTE.muted};">
      ${esc(formatDay(order.createdAt))}
    </td>
  </tr>
</table>

${itemsTable(order)}
${totalsTable(order)}
${cashReminder(order)}

${downloadsBlock(order, trackUrl)}
${addressBlock(order)}
`;

  const legal = [
    settings.legal.companyName || settings.shopName,
    settings.legal.address,
    settings.legal.email || settings.contactEmail,
    settings.legal.vatNumber ? `TVA ${settings.legal.vatNumber}` : "",
  ].filter((line) => line && line.trim());

  return {
    to: order.customer.email,
    subject: subject(order, status),
    html: shell({
      preheader: `${headlineText} — ${introText}`,
      shopName: settings.shopName,
      siteUrl,
      body,
      legal,
    }),
    text: renderOrderText({ order, settings, siteUrl, note }, status),
  };
}

/**
 * Version texte. Ce n'est pas un doublon négligeable : les filtres anti-spam
 * pénalisent un message sans alternative texte, et certains lecteurs n'affichent
 * que celle-ci.
 */
export function renderOrderText(
  { order, settings, siteUrl, note }: OrderEmailContext,
  status: OrderStatus = order.status,
): string {
  const lines: string[] = [
    headline(order, status),
    "",
    `Bonjour ${order.customer.firstName},`,
    "",
    intro(order, status),
    "",
    `Commande ${order.number} du ${formatDay(order.createdAt)}`,
    "",
  ];

  for (const item of order.items) {
    lines.push(
      `- ${item.name} (${item.sku}) × ${item.quantity} : ${formatPrice(item.lineTotalCents, order.currency)}`,
    );
  }

  lines.push("");
  lines.push(`Sous-total : ${formatPrice(order.subtotalCents, order.currency)}`);
  if (order.discountCents > 0) {
    lines.push(
      `Remise${order.promoCode ? ` (${order.promoCode})` : ""} : -${formatPrice(order.discountCents, order.currency)}`,
    );
  }
  if (!isDigitalOnly(order.items)) {
    lines.push(
      `Livraison : ${order.shippingCents > 0 ? formatPrice(order.shippingCents, order.currency) : "offerte"}`,
    );
  }
  lines.push(`Total : ${formatPrice(order.totalCents, order.currency)}`);

  if (
    order.paymentMethod === "cash_on_delivery" &&
    !isStoppedStatus(order.status) &&
    order.status !== "delivered"
  ) {
    lines.push(
      "",
      `À régler à la livraison : ${formatPrice(order.totalCents, order.currency)} en espèces, remis en main propre au livreur.`,
    );
  }

  if (note) {
    lines.push("", `Message de la boutique : ${note}`);
  }

  lines.push("", `Suivre ma commande : ${siteUrl}/suivi`, "", settings.shopName);

  return lines.join("\n");
}
