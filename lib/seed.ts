import type { Bike, State } from "./types";

function defaultBikes(): Bike[] {
  const now = new Date().toISOString();
  return [
    {
      kind: "normal",
      name: "Vélo normal",
      description:
        "Un vélo de ville confortable, idéal pour circuler au quotidien ou pour une balade. Simple, robuste et facile à prendre en main.",
      imageUrl: "",
      active: true,
      features: ["21 vitesses", "Panier avant", "Antivol fourni", "Éclairage avant/arrière"],
      updatedAt: now,
    },
    {
      kind: "electric",
      name: "Vélo électrique",
      description:
        "Un vélo à assistance électrique pour avaler les trajets et les côtes sans effort. Parfait pour les plus longues distances.",
      imageUrl: "",
      active: true,
      features: ["Autonomie ≈ 60 km", "Assistance 3 niveaux", "Chargeur fourni", "Antivol fourni"],
      updatedAt: now,
    },
  ];
}

export function initialState(): State {
  return {
    schemaVersion: 1,
    settings: {
      siteName: "VéloLoc",
      // Adresse de contact / réception des notifications admin. Modifiable
      // uniquement via la variable d'environnement ADMIN_EMAIL pour l'instant.
      contactEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || "",
    },
    bikes: defaultBikes(),
    requests: [],
    admins: [],
    sessions: [],
  };
}
