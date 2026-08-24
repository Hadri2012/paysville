import { requireAdmin } from "@/lib/auth";
import { NOTIFIED_STATUSES, renderOrderEmail } from "@/lib/email/orderEmails";
import { sampleOrder } from "@/lib/email/sample";
import { jsonError, siteUrl } from "@/lib/http";
import { readState } from "@/lib/store";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Aperçu d'un e-mail de suivi, tel que le client le recevra.
 *
 * Réservé à l'administration : le message porte la charte de la boutique et
 * ses mentions légales, il n'a pas à être servi publiquement.
 *
 * La réponse est du HTML brut, destiné à être affiché dans un cadre depuis la
 * page « E-mails » de l'administration. Le contenu est celui du gabarit réel —
 * pas une imitation — appliqué à une commande fictive (`lib/email/sample.ts`),
 * pour que ce qui est vérifié ici soit exactement ce qui part.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const requested = cleanString(url.searchParams.get("statut"), 40) as OrderStatus;
    const status: OrderStatus =
      ORDER_STATUSES.includes(requested) && NOTIFIED_STATUSES.includes(requested)
        ? requested
        : "paid";

    const state = await readState();
    const { html } = renderOrderEmail(
      {
        order: sampleOrder(status),
        settings: state.settings,
        siteUrl: siteUrl(request),
        note:
          status === "shipped"
            ? "Colis confié à bpost, numéro de suivi 3230 1234 5678."
            : undefined,
      },
      status,
    );

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
