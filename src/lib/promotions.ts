import type { Lot, Promotion } from "./types";

type LotLike = Pick<Lot, "id" | "name" | "valueType" | "valueAmount" | "productKey" | "validFrom" | "expiresAt" | "status">;

/** Lotti attivi e in corso di validità, ridotti ai soli dati mostrabili allo studente. */
export function activePromotions(lots: LotLike[], now = new Date()): Promotion[] {
  return lots
    .filter((l) => l.status === "ACTIVE")
    .filter((l) => !l.expiresAt || new Date(l.expiresAt) >= now)
    .map((l) => ({
      id: l.id,
      name: l.name,
      valueType: l.valueType,
      valueAmount: l.valueAmount,
      productKey: l.productKey,
      validFrom: l.validFrom,
      expiresAt: l.expiresAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
