/**
 * Envoi d'e-mails transactionnels via l'API HTTP de Resend.
 *
 * Deux principes tiennent tout ce fichier :
 *
 *  - **Inactif par défaut.** Tant que `RESEND_API_KEY` et `MAIL_FROM` ne sont pas
 *    tous les deux renseignés, aucun envoi n'est tenté et la boutique fonctionne
 *    exactement comme avant.
 *  - **Ne casse jamais l'appelant.** Un e-mail est une notification, pas une étape
 *    du paiement : une panne de Resend ne doit jamais faire échouer un webhook
 *    Stripe (qui serait alors rejoué) ni une mise à jour de statut. Toutes les
 *    erreurs sont donc journalisées puis avalées, et `sendMail` renvoie un booléen.
 *
 * On passe par `fetch` plutôt que par le SDK : aucune dépendance supplémentaire,
 * et le runtime Node de Vercel le fournit nativement.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Expéditeur : "Hadrishop <commandes@mondomaine.be>" ou une simple adresse. */
function mailFrom(): string {
  return (process.env.MAIL_FROM ?? "").trim();
}

export function isMailerConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? "").trim() && mailFrom());
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Version texte : indispensable pour la délivrabilité et les clients sans HTML. */
  text: string;
}

/** Renvoie `true` si l'e-mail a bien été accepté par Resend, `false` sinon. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!isMailerConfigured()) return false;
  if (!message.to.includes("@")) return false;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${(process.env.RESEND_API_KEY ?? "").trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[hadrishop] envoi d'e-mail refusé par Resend (${response.status}) : ${detail}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[hadrishop] envoi d'e-mail impossible", error);
    return false;
  }
}

/** Échappe le texte inséré dans un gabarit HTML (nom, adresse, remarque du client). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
