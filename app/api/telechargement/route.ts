import { timingSafeEqual } from "crypto";
import { readAsset } from "@/lib/assets";
import { orderDownloads } from "@/lib/digital";
import { errors } from "@/lib/errors";
import { jsonError, limit, limitGlobal } from "@/lib/http";
import { findOrderByNumber } from "@/lib/orders";
import { readState } from "@/lib/store";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

function tokenMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Remise d'un fichier acheté.
 *
 * Trois conditions, toutes vérifiées ici : le numéro de commande existe, le
 * jeton d'accès de cette commande correspond exactement (comparaison à temps
 * constant), et la commande est payée et ni annulée ni remboursée. Le fichier
 * demandé doit en outre figurer parmi ceux auxquels cette commande donne droit —
 * connaître un identifiant d'asset ne suffit jamais.
 */
export async function GET(request: Request): Promise<Response> {
  // `handle()` n'est pas utilisé ici : il impose une réponse JSON, alors que le
  // succès est un flux binaire. Les erreurs, elles, restent au format habituel.
  try {
    limit(request, "download", 60, 60_000);
    // Filet global : le jeton d'accès n'est pas devinable (impossible à
    // brute-forcer, contrairement à un numéro de commande), mais changer
    // d'adresse IP prétendue à chaque appel épuiserait sinon la bande passante
    // sans jamais être ralenti (voir `limitGlobal`).
    limitGlobal("download", 600, 60_000);

    const url = new URL(request.url);
    const number = cleanString(url.searchParams.get("commande"), 40);
    const token = cleanString(url.searchParams.get("token"), 128);
    const fileId = cleanString(url.searchParams.get("fichier"), 80);
    if (!number || !token || !fileId) throw errors.orderNotFound();

    const state = await readState();
    const order = findOrderByNumber(state, number);
    if (!order || !tokenMatches(order.accessToken, token)) throw errors.orderNotFound();

    const granted = orderDownloads(state, order)
      .flatMap((group) => group.files)
      .find((file) => file.fileId === fileId);
    if (!granted) throw errors.downloadNotAvailable();

    const bytes = await readAsset(fileId);
    if (!bytes) throw errors.downloadNotAvailable();

    // Le fichier est toujours servi en pièce jointe, avec un type générique :
    // rien de ce que la boutique met en vente n'a vocation à être interprété par
    // le navigateur (un HTML vendu ne doit pas s'exécuter sur notre domaine).
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          granted.name,
        )}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
