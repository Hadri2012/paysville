import { formatLocalDisplay } from "./datetime";
import type { RentalRequest } from "./types";

type BikeLike = { name: string };

/**
 * Notifications par e-mail, entierement optionnelles : sans RESEND_API_KEY
 * configuree, le site continue de fonctionner normalement (les demandes sont
 * simplement consultables depuis /suivi et /admin, comme toujours). Utilise
 * l'API HTTP de Resend directement (pas de dependance SMTP a installer).
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`[veloloc] e-mail non envoye (service non configure) - a ${to} : ${subject}`);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      console.error("[veloloc] echec envoi e-mail", response.status, await response.text());
    }
  } catch (error) {
    // Une panne du service d'e-mail ne doit jamais casser la demande / l'acceptation.
    console.error("[veloloc] erreur envoi e-mail", error);
  }
}

function periodBlock(request: RentalRequest): string {
  return `<p><strong>Debut :</strong> ${formatLocalDisplay(request.startAt)}<br/>
  <strong>Fin :</strong> ${formatLocalDisplay(request.endAt)}</p>`;
}

export async function sendClientConfirmation(request: RentalRequest, bike: BikeLike): Promise<void> {
  await sendEmail(
    request.customer.email,
    `Demande recue - ${request.number}`,
    `<p>Bonjour ${request.customer.firstName},</p>
     <p>Votre demande de location pour le <strong>${bike.name}</strong> a bien ete recue.
     Elle doit encore etre acceptee par le proprietaire.</p>
     <p><strong>Numero de demande :</strong> ${request.number}</p>
     ${periodBlock(request)}
     <p>Vous pouvez suivre son statut a tout moment depuis la page « Suivi de demande »
     avec ce numero et votre adresse e-mail.</p>`,
  );
}

export async function sendAdminNewRequestNotification(
  request: RentalRequest,
  bike: BikeLike,
  adminEmail: string,
): Promise<void> {
  if (!adminEmail) return;
  await sendEmail(
    adminEmail,
    `Nouvelle demande de location - ${request.number}`,
    `<p>Nouvelle demande pour le <strong>${bike.name}</strong> :</p>
     <p>${request.customer.firstName} ${request.customer.lastName} - ${request.customer.email} - ${request.customer.phone}</p>
     ${periodBlock(request)}
     ${request.message ? `<p><strong>Message :</strong> ${request.message}</p>` : ""}
     <p>Numero de demande : ${request.number}</p>`,
  );
}

export async function sendClientAcceptedNotification(request: RentalRequest, bike: BikeLike): Promise<void> {
  await sendEmail(
    request.customer.email,
    `Demande acceptee - ${request.number}`,
    `<p>Bonjour ${request.customer.firstName},</p>
     <p>Bonne nouvelle : votre demande de location pour le <strong>${bike.name}</strong> a ete acceptee.</p>
     ${periodBlock(request)}
     ${request.adminComment ? `<p><strong>Message du proprietaire :</strong> ${request.adminComment}</p>` : ""}
     <p>Numero de demande : ${request.number}</p>`,
  );
}

export async function sendClientRefusedNotification(request: RentalRequest, bike: BikeLike): Promise<void> {
  await sendEmail(
    request.customer.email,
    `Demande refusee - ${request.number}`,
    `<p>Bonjour ${request.customer.firstName},</p>
     <p>Votre demande de location pour le <strong>${bike.name}</strong> n'a malheureusement pas ete acceptee.</p>
     ${request.adminComment ? `<p><strong>Message du proprietaire :</strong> ${request.adminComment}</p>` : ""}
     <p>Numero de demande : ${request.number}</p>`,
  );
}
