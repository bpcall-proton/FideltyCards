import type { CodeFormat } from "./types";

const NUMERIC = "0123456789";
const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Codice casuale non prevedibile (CSPRNG). Usato solo in modalità demo: in produzione genera il database. */
export function randomCode(format: CodeFormat, length: number): string {
  const alphabet = format === "alphanumeric" ? ALPHANUM : NUMERIC;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/** Estrae il codice da un QR: accetta il codice puro o un URL .../redeem?code=XYZ */
export function codeFromQrPayload(payload: string): string {
  try {
    const url = new URL(payload);
    const c = url.searchParams.get("code");
    if (c) return normalizeCode(c);
  } catch {
    /* non è un URL */
  }
  return normalizeCode(payload);
}

export function qrPayloadFor(code: string): string {
  return `${window.location.origin}/redeem?code=${encodeURIComponent(code)}`;
}
