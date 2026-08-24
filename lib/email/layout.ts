/**
 * Gabarit visuel des e-mails de la boutique.
 *
 * ## Pourquoi des tableaux et des styles en ligne
 *
 * Un e-mail n'est pas une page web : les logiciels de messagerie retirent
 * souvent les feuilles de style, ignorent la mise en page moderne (flexbox,
 * grille) et, pour Outlook sur Windows, s'appuient sur le moteur de rendu de
 * Word. La mise en page passe donc par des tableaux imbriqués et des styles
 * écrits directement sur chaque balise. La balise `<style>` n'ajoute que ce qui
 * peut disparaître sans dommage : adaptation aux petits écrans et thème sombre.
 *
 * ## Charte
 *
 * Les couleurs sont celles du site (`app/globals.css`) : même vert de marque,
 * même orange d'accent, mêmes gris. Un e-mail qui ne ressemble pas à la
 * boutique donne l'impression d'une contrefaçon — exactement ce qu'on veut
 * éviter sur un message qui parle de paiement.
 */

import { SHOP_MONOGRAM } from "../brand";

export const PALETTE = {
  brand: "#0f5c4d",
  brandStrong: "#0a4437",
  brandLight: "#1c8a72",
  brandSoft: "#e7f2ef",
  accent: "#d97a2b",
  accentSoft: "#fdf1e5",
  ink: "#16181d",
  ink2: "#3b4048",
  muted: "#6b7280",
  line: "#e5e7eb",
  lineStrong: "#d3d7dd",
  surface: "#f7f8f7",
  page: "#eef1f0",
  danger: "#b42318",
  dangerSoft: "#fef3f2",
  success: "#067647",
  successSoft: "#ecfdf3",
  white: "#ffffff",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Échappement HTML.
 *
 * Indispensable, pas cosmétique : un e-mail reprend des données saisies par le
 * client (nom, adresse, remarque) et par la boutique (nom d'article, note de
 * statut). Sans échappement, une apostrophe typographique passerait mais un
 * chevron casserait la mise en page — et un contenu hostile pourrait injecter
 * du balisage dans un message signé de la boutique.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bouton d'action, construit en tableau pour survivre à Outlook. */
export function button(href: string, label: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${PALETTE.brand}" style="border-radius:10px;">
      <a href="${esc(href)}"
         style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${PALETTE.brand};">
        ${esc(label)}
      </a>
    </td>
  </tr>
</table>`;
}

/** Intitulé de section : petites capitales espacées, comme sur le site. */
export function sectionTitle(label: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${PALETTE.muted};">${esc(label)}</p>`;
}

export function divider(): string {
  return `<div style="height:1px;line-height:1px;font-size:0;background-color:${PALETTE.line};margin:28px 0;">&nbsp;</div>`;
}

/** Encadré discret, pour un récapitulatif ou une adresse. */
export function panel(inner: string, tone: "neutral" | "brand" | "warn" = "neutral"): string {
  const background =
    tone === "brand"
      ? PALETTE.brandSoft
      : tone === "warn"
        ? PALETTE.accentSoft
        : PALETTE.surface;
  const border =
    tone === "brand" ? "#cfe3dd" : tone === "warn" ? "#f5dcc2" : PALETTE.line;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td style="background-color:${background};border:1px solid ${border};border-radius:12px;padding:18px 20px;font-family:${FONT};font-size:14px;line-height:1.6;color:${PALETTE.ink2};">
      ${inner}
    </td>
  </tr>
</table>`;
}

export interface ShellOptions {
  /** Texte d'aperçu affiché après l'objet dans la liste des messages. */
  preheader: string;
  shopName: string;
  siteUrl: string;
  /** Contenu principal, déjà mis en forme. */
  body: string;
  /** Mentions légales du bas de message. */
  legal: string[];
}

/**
 * Document complet. La largeur est bornée à 600 px — au-delà, les clients de
 * messagerie sur mobile réduisent l'ensemble et le texte devient illisible.
 */
export function shell({ preheader, shopName, siteUrl, body, legal }: ShellOptions): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${esc(shopName)}</title>
<style>
  /* Retiré par certains clients : rien d'essentiel ici. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${PALETTE.brand}; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .stack-cell { display:block !important; width:100% !important; text-align:left !important; }
    .h1 { font-size:23px !important; }
    .num-right { text-align:left !important; }
  }
  @media (prefers-color-scheme: dark) {
    .page-bg { background-color:#12171a !important; }
    .card-bg { background-color:#1b2226 !important; }
    .ink { color:#eceff1 !important; }
    .ink-2 { color:#c3cbd1 !important; }
    .muted { color:#9aa4ad !important; }
    .soft-bg { background-color:#222b30 !important; border-color:#33403f !important; }
    .rule { background-color:#33403f !important; }
  }
</style>
</head>
<body class="page-bg" style="margin:0;padding:0;background-color:${PALETTE.page};">
<div style="display:none;font-size:1px;color:${PALETTE.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<!-- Espace insécable répété : empêche le client d'afficher le début du corps après l'aperçu. -->
<div style="display:none;font-size:1px;color:${PALETTE.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page-bg" style="background-color:${PALETTE.page};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">

      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- Bandeau de marque -->
        <tr>
          <td style="border-radius:16px 16px 0 0;background-color:${PALETTE.brand};background-image:linear-gradient(135deg, ${PALETTE.brand} 0%, ${PALETTE.brandLight} 100%);padding:26px 34px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="38" height="38" align="center" valign="middle"
                          style="width:38px;height:38px;background-color:rgba(255,255,255,0.18);border-radius:11px;font-family:${FONT};font-size:14px;font-weight:800;color:#ffffff;">
                        ${esc(SHOP_MONOGRAM)}
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="font-family:${FONT};font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                  ${esc(shopName)}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Corps -->
        <tr>
          <td class="card-bg pad" style="background-color:${PALETTE.white};padding:34px;border-left:1px solid ${PALETTE.line};border-right:1px solid ${PALETTE.line};">
            ${body}
          </td>
        </tr>

        <!-- Pied de carte -->
        <tr>
          <td class="card-bg pad" style="background-color:${PALETTE.white};border-radius:0 0 16px 16px;border:1px solid ${PALETTE.line};border-top:0;padding:22px 34px 26px;">
            <p class="muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${PALETTE.muted};">
              ${legal.map((line) => esc(line)).join("<br />")}
            </p>
          </td>
        </tr>

        <!-- Hors carte -->
        <tr>
          <td align="center" style="padding:20px 24px 0;">
            <p class="muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${PALETTE.muted};">
              Ce message vous est envoyé parce que vous avez passé commande sur
              <a href="${esc(siteUrl)}" style="color:${PALETTE.muted};text-decoration:underline;">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a>.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export { FONT };
