import { randomBytes, randomUUID } from "crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

const REQUEST_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans O/0/I/1, ambigus

/** Numéro de demande lisible et unique, ex. « VL-2026-7K3F9Q ». Vérifié côté appelant. */
export function generateRequestNumber(): string {
  const year = new Date().getFullYear();
  let suffix = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    suffix += REQUEST_NUMBER_ALPHABET[bytes[i] % REQUEST_NUMBER_ALPHABET.length];
  }
  return `VL-${year}-${suffix}`;
}
