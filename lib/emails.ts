import { escapeHtml, type MailMessage } from "./mailer";
import { formatPrice } from "./money";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "./types";

/**
 * Gabarits des e-mails envoyés au client.
 *
 * Style volontairement en attributs `style` en ligne et en tableaux : les clients
 * de messagerie (Gmail, Outlook, Mail iOS) ignorent les feuilles de style externes
 * et une bonne partie du CSS moderne. Chaque message a aussi une version texte,
 * qui compte autant pour la délivrabilité que pour les lecteurs d'écran.
 *
 * Toute donnée saisie par le client (nom, adresse, remarque) passe par
 * `escapeHtml` avant d'entrer dans le HTML.
 */

const BRAND = "#1f6feb";
const INK = "#1a1d21";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

function layout(options: {
  shopName: string;
  title: string;
  intro: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer: string;
}): string {
  const cta =
    options.ctaLabel && options.ctaUrl
      ? `<tr><td style="padding:8px 0 24px;">
           <a href="${options.ctaUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(
             options.ctaLabel,
           )}</a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
        <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:700;padding-bottom:6px;">${escapeHtml(
          options.shopName,
        )}</td></tr>
        <tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:10px;">${escapeHtml(
          options.title,
        )}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:${INK};padding-bottom:20px;">${options.intro}</td></tr>
        ${cta}
        <tr><td>${options.body}</td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid ${LINE};font-size:13px;line-height:1.6;color:${MUTED};">${options.footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Tableau récapitulatif des articles + totaux. */
function itemsTable(order: Order): string {
  const rows = order.items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;">
          ${escapeHtml(item.name)}
          <div style="color:${MUTED};font-size:12px;">${escapeHtml(item.sku)} × ${item.quantity}</div>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;text-align:right;white-space:nowrap;">
          ${formatPrice(item.lineTotalCents, order.currency)}
        </td>
      </tr>`,
    )
    .join("");

  const summaryRow = (label: string, value: string, strong = false) =>
    `<tr>
      <td style="padding:5px 0;font-size:${strong ? "16px" : "14px"};${strong ? "font-weight:700;" : `color:${MUTED};`}">${escapeHtml(label)}</td>
      <td style="padding:5px 0;font-size:${strong ? "16px" : "14px"};text-align:right;white-space:nowrap;${strong ? "font-weight:700;" : ""}">${value}</td>
    </tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td colspan="2" style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};padding-bottom:6px;">Votre commande</td></tr>
    ${rows}
    ${summaryRow("Sous-total", formatPrice(order.subtotalCents, order.currency))}
    ${
      order.discountCents > 0
        ? summaryRow(
            `Remise${order.promoCode ? ` (${order.promoCode})` : ""}`,
            `− ${formatPrice(order.discountCents, order.currency)}`,
          )
        : ""
    }
    ${summaryRow(
      "Livraison",
      order.shippingCents > 0 ? formatPrice(order.shippingCents, order.currency) : "Offerte",
    )}
    ${summaryRow("Total", formatPrice(order.totalCents, order.currency), true)}
  </table>`;
}

function addressBlock(order: Order): string {
  const a = order.address;
  const lines = [
    `${order.customer.firstName} ${order.customer.lastName}`,
    `${a.street} ${a.streetNumber}`,
    a.complement,
    `${a.postalCode} ${a.city}`,
    a.country,
  ].filter((line) => line && line.trim().length > 0);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <tr><td style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};padding-bottom:6px;">Adresse de livraison</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;">${lines.map((l) => escapeHtml(l)).join("<br>")}</td></tr>
  </table>`;
}

function itemsText(order: Order): string {
  const lines = order.items.map(
    (item) =>
      `  - ${item.name} (${item.sku}) × ${item.quantity} : ${formatPrice(item.lineTotalCents, order.currency)}`,
  );
  lines.push(`  Sous-total : ${formatPrice(order.subtotalCents, order.currency)}`);
  if (order.discountCents > 0) {
    lines.push(
      `  Remise${order.promoCode ? ` (${order.promoCode})` : ""} : -${formatPrice(order.discountCents, order.currency)}`,
    );
  }
  lines.push(
    `  Livraison : ${order.shippingCents > 0 ? formatPrice(order.shippingCents, order.currency) : "offerte"}`,
  );
  lines.push(`  TOTAL : ${formatPrice(order.totalCents, order.currency)}`);
  return lines.join("\n");
}

function addressText(order: Order): string {
  const a = order.address;
  return [
    `${order.customer.firstName} ${order.customer.lastName}`,
    `${a.street} ${a.streetNumber}`,
    a.complement,
    `${a.postalCode} ${a.city}`,
    a.country,
  ]
    .filter((line) => line && line.trim().length > 0)
    .map((line) => `  ${line}`)
    .join("\n");
}

/** Lien direct vers la commande (le jeton fait office de mot de passe à usage unique). */
function orderUrl(order: Order, site: string): string {
  return `${site}/confirmation?commande=${encodeURIComponent(order.number)}&token=${encodeURIComponent(
    order.accessToken,
  )}`;
}

function footerHtml(shopName: string, site: string, contactEmail: string): string {
  const contact = contactEmail
    ? ` Une question ? Écrivez-nous à <a href="mailto:${escapeHtml(contactEmail)}" style="color:${BRAND};">${escapeHtml(contactEmail)}</a>.`
    : "";
  return `${escapeHtml(shopName)} — <a href="${site}" style="color:${BRAND};">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a>.${contact}
    <br>Vous pouvez suivre votre commande à tout moment depuis <a href="${site}/suivi" style="color:${BRAND};">la page de suivi</a>, avec votre numéro de commande et votre adresse e-mail.`;
}

function footerText(shopName: string, site: string, contactEmail: string): string {
  return [
    "",
    `${shopName} — ${site}`,
    contactEmail ? `Une question ? ${contactEmail}` : "",
    `Suivi de commande : ${site}/suivi (numéro de commande + adresse e-mail)`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface EmailContext {
  shopName: string;
  contactEmail: string;
  site: string;
}

/** E-mail envoyé une seule fois, dès que Stripe confirme le paiement. */
export function orderConfirmationEmail(order: Order, ctx: EmailContext): MailMessage {
  const intro = `Bonjour ${escapeHtml(order.customer.firstName)},<br><br>
    Votre paiement a bien été confirmé, merci pour votre commande&nbsp;! Elle porte le numéro
    <strong style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(order.number)}</strong>
    — conservez-le, il vous permet d'en suivre l'avancement à tout moment.`;

  const body =
    itemsTable(order) +
    addressBlock(order) +
    (order.note
      ? `<p style="margin-top:20px;font-size:13px;color:${MUTED};"><strong>Votre remarque :</strong> ${escapeHtml(order.note)}</p>`
      : "");

  const html = layout({
    shopName: ctx.shopName,
    title: "Merci pour votre commande !",
    intro,
    body,
    ctaLabel: "Voir ma commande",
    ctaUrl: orderUrl(order, ctx.site),
    footer: footerHtml(ctx.shopName, ctx.site, ctx.contactEmail),
  });

  const text = `Bonjour ${order.customer.firstName},

Votre paiement a bien été confirmé, merci pour votre commande !

Numéro de commande : ${order.number}
Suivre ma commande : ${orderUrl(order, ctx.site)}

VOTRE COMMANDE
${itemsText(order)}

ADRESSE DE LIVRAISON
${addressText(order)}
${order.note ? `\nVotre remarque : ${order.note}\n` : ""}${footerText(ctx.shopName, ctx.site, ctx.contactEmail)}`;

  return {
    to: order.customer.email,
    subject: `Commande ${order.number} confirmée — ${ctx.shopName}`,
    html,
    text,
  };
}

/**
 * Formulations par statut. Les statuts absents de cette table ne déclenchent aucun
 * e-mail : « en attente de paiement » n'intéresse pas le client, et « payée » est
 * déjà couvert par l'e-mail de confirmation ci-dessus (on éviterait sinon un doublon).
 */
const STATUS_MESSAGES: Partial<
  Record<OrderStatus, { subject: string; title: string; message: string }>
> = {
  preparing: {
    subject: "Votre commande est en préparation",
    title: "Votre commande est en préparation",
    message:
      "Nous préparons vos articles. Vous recevrez un nouveau message dès qu'elle sera prête.",
  },
  ready: {
    subject: "Votre commande est prête",
    title: "Votre commande est prête !",
    message: "Vos articles sont prêts. Nous vous recontactons pour la remise ou l'expédition.",
  },
  shipped: {
    subject: "Votre commande est en route",
    title: "Votre commande est en route",
    message: "Votre colis vient de partir. Il devrait arriver très prochainement.",
  },
  delivered: {
    subject: "Votre commande a été livrée",
    title: "Votre commande a été livrée",
    message:
      "Votre commande a été remise. Nous espérons qu'elle vous plaira — n'hésitez pas à nous écrire si quelque chose ne va pas.",
  },
  canceled: {
    subject: "Votre commande a été annulée",
    title: "Votre commande a été annulée",
    message:
      "Votre commande a été annulée. Si un paiement a été effectué, il vous sera intégralement remboursé.",
  },
  refunded: {
    subject: "Votre commande a été remboursée",
    title: "Votre commande a été remboursée",
    message:
      "Le remboursement a été effectué. Selon votre banque, il peut mettre quelques jours à apparaître sur votre compte.",
  },
};

/** `null` quand le statut ne justifie pas de prévenir le client. */
export function orderStatusEmail(order: Order, ctx: EmailContext): MailMessage | null {
  const preset = STATUS_MESSAGES[order.status];
  if (!preset) return null;

  const intro = `Bonjour ${escapeHtml(order.customer.firstName)},<br><br>
    ${escapeHtml(preset.message)}<br><br>
    Commande <strong style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(order.number)}</strong>
    — nouveau statut : <strong>${escapeHtml(ORDER_STATUS_LABELS[order.status])}</strong>.`;

  const html = layout({
    shopName: ctx.shopName,
    title: preset.title,
    intro,
    body: itemsTable(order) + addressBlock(order),
    ctaLabel: "Voir ma commande",
    ctaUrl: orderUrl(order, ctx.site),
    footer: footerHtml(ctx.shopName, ctx.site, ctx.contactEmail),
  });

  const text = `Bonjour ${order.customer.firstName},

${preset.message}

Commande ${order.number} — nouveau statut : ${ORDER_STATUS_LABELS[order.status]}
Voir ma commande : ${orderUrl(order, ctx.site)}

VOTRE COMMANDE
${itemsText(order)}

ADRESSE DE LIVRAISON
${addressText(order)}
${footerText(ctx.shopName, ctx.site, ctx.contactEmail)}`;

  return {
    to: order.customer.email,
    subject: `${preset.subject} — ${order.number}`,
    html,
    text,
  };
}
