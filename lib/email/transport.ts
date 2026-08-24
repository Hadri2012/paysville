/**
 * Envoi des e-mails de la boutique.
 *
 * Aucune dépendance ajoutée : l'API HTTP de Resend s'appelle très bien avec
 * `fetch`, et une bibliothèque SMTP complète serait disproportionnée pour les
 * quelques messages transactionnels envoyés ici.
 *
 * Trois modes, selon la configuration :
 *
 *  - `RESEND_API_KEY` renseignée → envoi réel.
 *  - rien de configuré → mode « journal » : le message est écrit dans la console
 *    du serveur au lieu d'être envoyé. C'est le comportement en développement,
 *    et c'est volontaire : une boutique qui n'a pas encore branché son service
 *    d'e-mail doit continuer à encaisser des commandes normalement.
 *  - `EMAIL_DRY_RUN=1` → mode journal forcé, même avec une clé (utile pour
 *    tester une mise en production sans écrire à de vrais clients).
 *
 * Un échec d'envoi ne remonte jamais jusqu'à l'appelant : perdre un accusé de
 * réception est ennuyeux, faire échouer une confirmation de paiement à cause
 * d'un service d'e-mail indisponible serait bien pire.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Version texte, indispensable pour la délivrabilité et les lecteurs sobres. */
  text: string;
}

export type EmailOutcome = "sent" | "logged" | "failed";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Expéditeur : `EMAIL_FROM`, sinon une valeur de repli explicite. */
function sender(): string {
  return process.env.EMAIL_FROM || "Hadrishop <onboarding@resend.dev>";
}

function dryRun(): boolean {
  return process.env.EMAIL_DRY_RUN === "1";
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && !dryRun();
}

/**
 * Adresse plausible ? Un contrôle volontairement grossier : il ne s'agit pas de
 * valider la saisie (c'est fait à la commande) mais d'éviter d'appeler le
 * service d'envoi avec une valeur manifestement vide ou tronquée.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  if (!looksLikeEmail(message.to)) {
    console.warn(`[hadrishop] e-mail non envoyé : destinataire invalide (${message.to})`);
    return "failed";
  }

  if (!isEmailConfigured()) {
    console.info(
      `[hadrishop] e-mail (mode journal) → ${message.to}\n  Objet : ${message.subject}\n` +
        message.text
          .split("\n")
          .map((line) => `  | ${line}`)
          .join("\n"),
    );
    return "logged";
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[hadrishop] envoi d'e-mail refusé (${response.status}) : ${detail.slice(0, 300)}`,
      );
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[hadrishop] envoi d'e-mail impossible", error);
    return "failed";
  }
}
