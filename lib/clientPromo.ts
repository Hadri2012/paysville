const KEY = "hadrishop.promo.v1";

export function readStoredPromo(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function storePromo(code: string): void {
  if (typeof window === "undefined") return;
  try {
    if (code) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}
