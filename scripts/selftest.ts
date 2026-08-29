/**
 * Test de la logique metier critique de VeloLoc : creation de demande, acceptation,
 * refus, double reservation, reservation simultanee des deux velos, velo desactive,
 * formulaire invalide, authentification admin, consultation du statut par le client.
 *
 *   npm run selftest
 */
import { findConflictingAcceptedRequest, isBikeCurrentlyRented } from "../lib/availability";
import { resolveAdminFromToken, login } from "../lib/auth";
import { updateBike } from "../lib/bikes";
import { isSafeImageUrl } from "../lib/images";
import {
  acceptRequest,
  createRentalRequest,
  deleteRequest,
  findRequestByNumberAndEmail,
  findRequestById,
  refuseRequest,
} from "../lib/requests";
import { readState, transaction } from "../lib/store";
import type { RentalRequest } from "../lib/types";

let failures = 0;

function check(label: string, condition: boolean, extra = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function expectThrowsAsync(label: string, fn: () => Promise<unknown>, code?: string): Promise<void> {
  try {
    await fn();
    failures += 1;
    console.log(`  FAIL ${label} — aucune erreur levee`);
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (code && actual !== code) {
      failures += 1;
      console.log(`  FAIL ${label} — code attendu "${code}", recu "${actual}"`);
    } else {
      console.log(`  ok   ${label}`);
    }
  }
}

function futurePeriod(daysFromNow: number, durationHours = 4) {
  const start = new Date(Date.now() + daysFromNow * 86_400_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const time = (d: Date) => d.toISOString().slice(11, 16);
  return {
    startDate: iso(start),
    startTime: time(start),
    endDate: iso(end),
    endTime: time(end),
  };
}

function baseForm(overrides: Record<string, unknown> = {}) {
  return {
    bikeKind: "normal",
    firstName: "Camille",
    lastName: "Dupont",
    email: "camille@example.com",
    phone: "+32 470 12 34 56",
    message: "Test",
    terms: true,
    ...futurePeriod(10),
    ...overrides,
  };
}

async function main() {
  console.log("== VeloLoc selftest ==");

  console.log("\n-- Etat initial --");
  let state = await readState();
  check("2 velos initialises", state.bikes.length === 2);
  check("velo normal actif par defaut", state.bikes.find((b) => b.kind === "normal")?.active === true);
  check("velo electrique actif par defaut", state.bikes.find((b) => b.kind === "electric")?.active === true);
  check("aucune demande au demarrage", state.requests.length === 0);

  console.log("\n-- Creation d'une demande : velo normal --");
  let normalRequest!: RentalRequest;
  await transaction((s) => {
    normalRequest = createRentalRequest(s, baseForm({ bikeKind: "normal" }));
  });
  check("statut initial = en attente", normalRequest.status === "pending");
  check("numero de demande genere", /^VL-\d{4}-[A-Z0-9]{6}$/.test(normalRequest.number));
  check("periode enregistree", normalRequest.startAt < normalRequest.endAt);

  console.log("\n-- Creation d'une demande : velo electrique --");
  let electricRequest!: RentalRequest;
  await transaction((s) => {
    electricRequest = createRentalRequest(
      s,
      baseForm({ bikeKind: "electric", email: "alex@example.com", ...futurePeriod(10) }),
    );
  });
  check("statut initial = en attente", electricRequest.status === "pending");
  check("numero different de la demande normale", electricRequest.number !== normalRequest.number);

  console.log("\n-- Formulaire invalide --");
  await expectThrowsAsync(
    "prenom trop court",
    async () => transaction((s) => createRentalRequest(s, baseForm({ firstName: "A" }))),
    "invalid_request_data",
  );
  await expectThrowsAsync(
    "e-mail invalide",
    async () => transaction((s) => createRentalRequest(s, baseForm({ email: "pas-un-email" }))),
    "invalid_request_data",
  );
  await expectThrowsAsync(
    "telephone invalide",
    async () => transaction((s) => createRentalRequest(s, baseForm({ phone: "abc" }))),
    "invalid_request_data",
  );
  await expectThrowsAsync(
    "fin avant le debut",
    async () =>
      transaction((s) =>
        createRentalRequest(s, baseForm({ startDate: "2030-01-10", endDate: "2030-01-09" })),
      ),
    "invalid_request_data",
  );
  await expectThrowsAsync(
    "conditions non acceptees",
    async () => transaction((s) => createRentalRequest(s, baseForm({ terms: false }))),
    "invalid_request_data",
  );
  await expectThrowsAsync(
    "type de velo inconnu",
    async () => transaction((s) => createRentalRequest(s, baseForm({ bikeKind: "trottinette" }))),
    "invalid_request_data",
  );

  console.log("\n-- Velo desactive --");
  await transaction((s) => updateBike(s, "electric", { active: false }));
  await expectThrowsAsync(
    "demande refusee pour un velo desactive",
    async () =>
      transaction((s) =>
        createRentalRequest(s, baseForm({ bikeKind: "electric", ...futurePeriod(20) })),
      ),
    "bike_unavailable",
  );
  await transaction((s) => updateBike(s, "electric", { active: true }));
  console.log("  ok   velo electrique reactive pour la suite des tests");

  console.log("\n-- Acceptation d'une demande --");
  await transaction((s) => acceptRequest(s, normalRequest.id));
  state = await readState();
  const accepted = findRequestById(state, normalRequest.id)!;
  check("statut = acceptee", accepted.status === "accepted");
  check("historique horodate", accepted.statusHistory.at(-1)?.status === "accepted");
  check(
    "le velo normal est desormais reserve sur cette periode",
    isBikeCurrentlyRented(state, "normal", accepted.startAt) === true,
  );

  console.log("\n-- Refus d'une demande --");
  let toRefuse!: RentalRequest;
  await transaction((s) => {
    toRefuse = createRentalRequest(s, baseForm({ bikeKind: "normal", ...futurePeriod(50) }));
  });
  await transaction((s) => refuseRequest(s, toRefuse.id, "Periode indisponible pour entretien."));
  state = await readState();
  const refused = findRequestById(state, toRefuse.id)!;
  check("statut = refusee", refused.status === "refused");
  check("commentaire enregistre", refused.adminComment.includes("entretien"));

  console.log("\n-- Double reservation du meme velo (chevauchement) --");
  const overlapPeriod = futurePeriod(100);
  let firstOverlap!: RentalRequest;
  let secondOverlap!: RentalRequest;
  await transaction((s) => {
    firstOverlap = createRentalRequest(s, baseForm({ bikeKind: "normal", ...overlapPeriod }));
    secondOverlap = createRentalRequest(
      s,
      baseForm({ bikeKind: "normal", email: "autre@example.com", ...overlapPeriod }),
    );
  });
  await transaction((s) => acceptRequest(s, firstOverlap.id));
  await expectThrowsAsync(
    "la seconde demande, chevauchante, ne peut pas etre acceptee",
    async () => transaction((s) => acceptRequest(s, secondOverlap.id)),
    "overlap",
  );
  state = await readState();
  check(
    "la seconde demande reste en attente",
    findRequestById(state, secondOverlap.id)?.status === "pending",
  );
  check(
    "le conflit est bien detecte par findConflictingAcceptedRequest",
    findConflictingAcceptedRequest(
      state,
      "normal",
      overlapPeriod.startDate + "T" + overlapPeriod.startTime,
      overlapPeriod.endDate + "T" + overlapPeriod.endTime,
    ) !== null,
  );

  console.log("\n-- Reservation simultanee du velo normal et du velo electrique --");
  const simulPeriod = futurePeriod(120);
  let simulNormal!: RentalRequest;
  let simulElectric!: RentalRequest;
  await transaction((s) => {
    simulNormal = createRentalRequest(s, baseForm({ bikeKind: "normal", ...simulPeriod }));
    simulElectric = createRentalRequest(
      s,
      baseForm({ bikeKind: "electric", email: "simul@example.com", ...simulPeriod }),
    );
  });
  await transaction((s) => acceptRequest(s, simulNormal.id));
  await transaction((s) => acceptRequest(s, simulElectric.id));
  state = await readState();
  check("le velo normal est accepte sur cette periode", findRequestById(state, simulNormal.id)?.status === "accepted");
  check(
    "le velo electrique est accepte sur la meme periode (ressource distincte)",
    findRequestById(state, simulElectric.id)?.status === "accepted",
  );

  console.log("\n-- Authentification admin --");
  check("aucun jeton = pas d'admin", resolveAdminFromToken(state, undefined) === null);
  check("jeton inconnu = pas d'admin", resolveAdminFromToken(state, "jeton-invalide") === null);

  process.env.ADMIN_EMAIL = "admin@veloloc.test";
  process.env.ADMIN_PASSWORD = "mot-de-passe-super-solide";
  await expectThrowsAsync(
    "mauvais mot de passe refuse",
    async () => login("admin@veloloc.test", "mauvais-mot-de-passe"),
    "invalid_credentials",
  );
  const token = await login("admin@veloloc.test", "mot-de-passe-super-solide");
  state = await readState();
  const identity = resolveAdminFromToken(state, token);
  check("connexion admin reussie avec les bons identifiants", identity?.email === "admin@veloloc.test");
  check("mot de passe jamais stocke en clair", !state.admins.some((a) => a.passwordHash === "mot-de-passe-super-solide"));

  console.log("\n-- Consultation du statut par le client --");
  check(
    "numero + bon e-mail retrouve la demande",
    findRequestByNumberAndEmail(state, accepted.number, accepted.customer.email)?.id === accepted.id,
  );
  check(
    "numero + mauvais e-mail ne retrouve rien",
    findRequestByNumberAndEmail(state, accepted.number, "inconnu@example.com") === undefined,
  );
  check(
    "numero inconnu ne retrouve rien",
    findRequestByNumberAndEmail(state, "VL-2000-000000", accepted.customer.email) === undefined,
  );

  console.log("\n-- Gestion des velos --");
  check("URL http(s) acceptee", isSafeImageUrl("https://example.com/velo.jpg") === true);
  check("URL data:image acceptee", isSafeImageUrl("data:image/png;base64,AAAA") === true);
  check("schema javascript: refuse", isSafeImageUrl("javascript:alert(1)") === false);

  console.log("\n-- Suppression d'une demande --");
  await transaction((s) => {
    deleteRequest(s, toRefuse.id);
  });
  state = await readState();
  check("la demande supprimee n'existe plus", findRequestById(state, toRefuse.id) === undefined);
  await expectThrowsAsync(
    "supprimer une demande inexistante echoue",
    async () => transaction((s) => deleteRequest(s, toRefuse.id)),
    "request_not_found",
  );

  console.log("\n== Resume ==");
  if (failures === 0) {
    console.log("Tous les tests sont passes.");
  } else {
    console.log(`${failures} test(s) en echec.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Erreur inattendue pendant les tests :", error);
  process.exitCode = 1;
});
