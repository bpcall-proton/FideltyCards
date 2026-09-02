import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as functionsV1 from "firebase-functions/v1";

initializeApp();
setGlobalOptions({ region: "europe-west1" });
const db = getFirestore();

const ADMIN_EMAILS = new Set(["software.bpcall@gmail.com"]);

export const onUserCreated = functionsV1
  .region("europe-west1")
  .auth.user()
  .onCreate(async (user) => {
    const email = user.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) return;
    await db.doc(`profiles/${user.uid}`).set(
      { role: "admin", level: 1, fullName: user.displayName ?? email, createdAt: Timestamp.now() },
      { merge: true },
    );
  });

type ValueType = "points" | "quantity" | "bonus" | "product" | "promotion";
type CodeFormat = "numeric" | "alphanumeric" | "qr" | "numeric_qr";
type CodeStatus = "ACTIVE" | "USED" | "EXPIRED" | "CANCELLED";

interface LotDoc {
  lotNumber: string;
  name: string;
  valueType: ValueType;
  valueAmount: number;
  productKey: string | null;
  productId: string | null;
  promotionId: string | null;
  codeFormat: CodeFormat;
  codeLength: number;
  totalCodes: number;
  validFrom: Timestamp | null;
  expiresAt: Timestamp | null;
  status: "ACTIVE" | "CANCELLED";
  maxCodesPerStudentPerDay: number | null;
  maxPointsPerStudentPerDay: number | null;
  maxTotalUses: number | null;
  minLevel: number | null;
  createdAt: Timestamp;
  createdBy: string;
  usedCount: number;
  cancelledCount: number;
}

interface CodeDoc {
  lotId: string;
  status: CodeStatus;
  usedBy: string | null;
  usedAt: Timestamp | null;
  transactionId: number | null;
  createdAt: Timestamp;
}

interface GoalDoc {
  name: string;
  counterKey: string;
  target: number;
  reward: string;
  active: boolean;
}

interface ProductDoc {
  name: string;
  stampTarget: number;
  reward: string;
  active: boolean;
  printLotId: string | null;
}

interface ProfileDoc {
  fullName: string;
  role: "student" | "admin";
  level: number;
}

const STAMPS_KEY = "stamps";
const productStampsKey = (productId: string) => `${STAMPS_KEY}:${productId}`;
const DEFAULT_STAMP_GOAL = { name: "stamps", counterKey: STAMPS_KEY, target: 10, reward: "Cafea gratis", active: true };
const VALUE_TYPES: ValueType[] = ["points", "quantity", "bonus", "product", "promotion"];
const CODE_FORMATS: CodeFormat[] = ["numeric", "alphanumeric", "qr", "numeric_qr"];
const MAX_QUANTITY = 100_000;
const BATCH = 500;

// ---------------------------------------------------------------- helpers

function uid(req: CallableRequest): string {
  const u = req.auth?.uid;
  if (!u) throw new HttpsError("unauthenticated", "NOT_AUTHENTICATED");
  return u;
}

async function requireAdmin(req: CallableRequest): Promise<string> {
  const u = uid(req);
  const snap = await db.doc(`profiles/${u}`).get();
  if (snap.data()?.role !== "admin") throw new HttpsError("permission-denied", "ADMIN_ONLY");
  return u;
}

/** Codice casuale (CSPRNG). Alfabeto senza caratteri ambigui (0/O, 1/I). */
function randomCode(format: CodeFormat, len: number): string {
  const alphabet = format === "alphanumeric" ? "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" : "0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").replace(/\s/g, "").toUpperCase();
}

async function nextSeq(t: Transaction, key: "lot" | "tx"): Promise<number> {
  const ref = db.doc("meta/sequences");
  const snap = await t.get(ref);
  const next = Number(snap.data()?.[key] ?? 0) + 1;
  t.set(ref, { [key]: next }, { merge: true });
  return next;
}

function toTs(v: unknown): Timestamp | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new HttpsError("invalid-argument", "Data non valida");
  return Timestamp.fromDate(d);
}

function optInt(v: unknown, name: string, min = 1): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new HttpsError("invalid-argument", `${name} non valido`);
  return n;
}

function startOfToday(): Timestamp {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

// ---------------------------------------------------------------- generateCodeLot

export const generateCodeLot = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (req) => {
  const admin = await requireAdmin(req);
  const d = req.data ?? {};

  const name = String(d.name ?? "").trim();
  if (!name) throw new HttpsError("invalid-argument", "Nome lotto obbligatorio");
  const valueType = d.valueType as ValueType;
  if (!VALUE_TYPES.includes(valueType)) throw new HttpsError("invalid-argument", "Tipo valore non valido");
  const valueAmount = optInt(d.valueAmount, "Valore") ?? 1;
  const quantity = optInt(d.quantity, "Quantità") ?? 0;
  if (quantity < 1 || quantity > MAX_QUANTITY) throw new HttpsError("invalid-argument", `Quantità tra 1 e ${MAX_QUANTITY}`);
  const codeFormat = (d.codeFormat ?? "numeric_qr") as CodeFormat;
  if (!CODE_FORMATS.includes(codeFormat)) throw new HttpsError("invalid-argument", "Formato non valido");
  const codeLength = optInt(d.codeLength, "Lunghezza", 4) ?? 6;
  if (codeLength > 24) throw new HttpsError("invalid-argument", "Lunghezza massima 24");
  // spazio dei codici sufficiente per evitare collisioni continue
  const space = Math.pow(codeFormat === "alphanumeric" ? 32 : 10, codeLength);
  if (quantity > space / 10) throw new HttpsError("invalid-argument", "Aumenta la lunghezza del codice per questa quantità");

  const productId = d.productId ? String(d.productId) : null;
  if (productId && !(await db.doc(`products/${productId}`).get()).exists) throw new HttpsError("not-found", "Prodotto non trovato");

  const now = Timestamp.now();
  const lotRef = db.collection("lots").doc();
  const lot: LotDoc = {
    lotNumber: "",
    name,
    valueType,
    valueAmount,
    productKey: d.productKey ? String(d.productKey).trim().toUpperCase() : null,
    productId,
    promotionId: d.promotionId ? String(d.promotionId).trim() : null,
    codeFormat,
    codeLength,
    totalCodes: quantity,
    validFrom: toTs(d.validFrom),
    expiresAt: toTs(d.expiresAt),
    status: "ACTIVE",
    maxCodesPerStudentPerDay: optInt(d.maxCodesPerStudentPerDay, "Limite codici/giorno"),
    maxPointsPerStudentPerDay: optInt(d.maxPointsPerStudentPerDay, "Limite punti/giorno"),
    maxTotalUses: optInt(d.maxTotalUses, "Limite utilizzi"),
    minLevel: optInt(d.minLevel, "Livello minimo", 0),
    createdAt: now,
    createdBy: admin,
    usedCount: 0,
    cancelledCount: 0,
  };

  await db.runTransaction(async (t) => {
    const seq = await nextSeq(t, "lot");
    lot.lotNumber = `${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`;
    t.create(lotRef, lot);
  });

  // generazione a lotti di 500: l'ID documento è il codice stesso → univocità garantita da Firestore
  let created = 0;
  const codes = db.collection("codes");
  while (created < quantity) {
    const want = Math.min(BATCH, quantity - created);
    const candidates = new Set<string>();
    while (candidates.size < want) candidates.add(randomCode(codeFormat === "alphanumeric" ? "alphanumeric" : "numeric", codeLength));
    const refs = [...candidates].map((c) => codes.doc(c));
    const existing = await db.getAll(...refs);
    const fresh = refs.filter((_, i) => !existing[i].exists);
    if (fresh.length === 0) continue;
    const batch = db.batch();
    const doc: CodeDoc = { lotId: lotRef.id, status: "ACTIVE", usedBy: null, usedAt: null, transactionId: null, createdAt: now };
    for (const r of fresh) batch.create(r, doc);
    await batch.commit();
    created += fresh.length;
  }

  return { lotId: lotRef.id, lotNumber: lot.lotNumber };
});

// ---------------------------------------------------------------- issueCode (stampa singola, anche preventiva)

/** Crea UN nuovo codice nel lotto di stampa del prodotto (o nel lotto indicato) e lo restituisce per la stampa. */
export const issueCode = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const productId = req.data?.productId ? String(req.data.productId) : null;
  let lotId = req.data?.lotId ? String(req.data.lotId) : null;
  let product: ProductDoc | null = null;
  const now = Timestamp.now();

  if (productId) {
    const pRef = db.doc(`products/${productId}`);
    const pSnap = await pRef.get();
    if (!pSnap.exists) throw new HttpsError("not-found", "Prodotto non trovato");
    product = pSnap.data() as ProductDoc;
    if (!lotId) {
      const existing = product.printLotId ? await db.doc(`lots/${product.printLotId}`).get() : null;
      if (existing?.exists && existing.data()?.status === "ACTIVE") lotId = existing.id;
      else {
        const lotRef = db.collection("lots").doc();
        const lot: LotDoc = {
          lotNumber: "", name: `${product.name} — stampa`, valueType: "product", valueAmount: 1,
          productKey: product.name.toUpperCase(), productId, promotionId: null, codeFormat: "numeric_qr", codeLength: 8,
          totalCodes: 0, validFrom: null, expiresAt: null, status: "ACTIVE", maxCodesPerStudentPerDay: null,
          maxPointsPerStudentPerDay: null, maxTotalUses: null, minLevel: null, createdAt: now, createdBy: admin, usedCount: 0, cancelledCount: 0,
        };
        await db.runTransaction(async (t) => {
          const seq = await nextSeq(t, "lot");
          lot.lotNumber = `${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`;
          t.create(lotRef, lot);
          t.update(pRef, { printLotId: lotRef.id });
        });
        lotId = lotRef.id;
      }
    }
  }
  if (!lotId) throw new HttpsError("invalid-argument", "Prodotto o lotto mancante");
  const lotRef = db.doc(`lots/${lotId}`);
  const lotSnap = await lotRef.get();
  if (!lotSnap.exists || lotSnap.data()?.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Lotto non attivo");
  const lot = lotSnap.data() as LotDoc;

  for (let i = 0; i < 20; i++) {
    const code = randomCode(lot.codeFormat === "alphanumeric" ? "alphanumeric" : "numeric", lot.codeLength);
    const ref = db.collection("codes").doc(code);
    try {
      await db.runTransaction(async (t) => {
        if ((await t.get(ref)).exists) throw new Error("DUP");
        const doc: CodeDoc & { printedAt: Timestamp } = { lotId: lotRef.id, status: "ACTIVE", usedBy: null, usedAt: null, transactionId: null, createdAt: now, printedAt: now };
        t.create(ref, doc);
        t.update(lotRef, { totalCodes: FieldValue.increment(1) });
      });
      return { code, lotId: lotRef.id, lotName: lot.name, productName: product?.name ?? lot.productKey ?? lot.name, reward: product?.reward ?? null, stampTarget: product?.stampTarget ?? null };
    } catch (e) {
      if (!(e instanceof Error && e.message === "DUP")) throw e;
    }
  }
  throw new HttpsError("internal", "Impossibile generare un codice univoco");
});

// ---------------------------------------------------------------- cancel*

async function cancelLotCodes(lotId: string): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await db.collection("codes").where("lotId", "==", lotId).where("status", "==", "ACTIVE").limit(BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { status: "CANCELLED" }));
    await batch.commit();
    n += snap.size;
  }
  if (n) await db.doc(`lots/${lotId}`).update({ cancelledCount: FieldValue.increment(n) });
  return n;
}

export const cancelCode = onCall(async (req) => {
  await requireAdmin(req);
  const code = normalizeCode(req.data?.code);
  await db.runTransaction(async (t) => {
    const ref = db.doc(`codes/${code}`);
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Codice non trovato");
    const c = snap.data() as CodeDoc;
    if (c.status !== "ACTIVE") return;
    t.update(ref, { status: "CANCELLED" });
    t.update(db.doc(`lots/${c.lotId}`), { cancelledCount: FieldValue.increment(1) });
  });
  return { ok: true };
});

export const cancelLot = onCall({ timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req);
  const lotId = String(req.data?.lotId ?? "");
  const ref = db.doc(`lots/${lotId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Lotto non trovato");
  await ref.update({ status: "CANCELLED" });
  const cancelled = await cancelLotCodes(lotId);
  return { ok: true, cancelled };
});

export const deleteLot = onCall({ timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req);
  const lotId = String(req.data?.lotId ?? "");
  const ref = db.doc(`lots/${lotId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Lotto non trovato");
  const lot = snap.data() as LotDoc;
  const expired = !!lot.expiresAt && lot.expiresAt.toMillis() <= Date.now();
  if (lot.status === "ACTIVE" && !expired) throw new HttpsError("failed-precondition", "Il lotto è attivo: disattivalo prima di eliminarlo");
  let deleted = 0;
  for (;;) {
    const codes = await db.collection("codes").where("lotId", "==", lotId).limit(BATCH).get();
    if (codes.empty) break;
    const batch = db.batch();
    codes.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += codes.size;
  }
  const products = await db.collection("products").where("printLotId", "==", lotId).get();
  await Promise.all(products.docs.map((d) => d.ref.update({ printLotId: null })));
  await ref.delete();
  return { ok: true, deleted };
});

export const cancelPromotion = onCall({ timeoutSeconds: 540 }, async (req) => {
  await requireAdmin(req);
  const promotionId = String(req.data?.promotionId ?? "");
  if (!promotionId) throw new HttpsError("invalid-argument", "Promozione mancante");
  const lots = await db.collection("lots").where("promotionId", "==", promotionId).where("status", "==", "ACTIVE").get();
  let cancelled = 0;
  for (const l of lots.docs) {
    await l.ref.update({ status: "CANCELLED" });
    cancelled += await cancelLotCodes(l.id);
  }
  return { ok: true, lots: lots.size, cancelled };
});

// ---------------------------------------------------------------- redeemCode

type RedeemError =
  | "NOT_AUTHENTICATED" | "NOT_FOUND" | "ALREADY_USED" | "CANCELLED" | "EXPIRED" | "NOT_YET_VALID"
  | "LEVEL_TOO_LOW" | "PROMOTION_EXHAUSTED" | "DAILY_LIMIT" | "DAILY_POINTS_LIMIT";

const fail = (error: RedeemError) => ({ ok: false as const, error });

/**
 * Riscatto monouso. Tutto avviene in UNA transazione Firestore: la lettura del codice
 * e il cambio di stato ACTIVE→USED sono atomici; se due studenti inviano lo stesso codice
 * nello stesso istante, la seconda transazione viene rieseguita, trova USED e fallisce.
 * Il valore accreditato è deciso qui dal lotto, mai dal client.
 */
export const redeemCode = onCall(async (req) => {
  const student = uid(req);
  const code = normalizeCode(req.data?.code);
  const deviceId = req.data?.deviceId ? String(req.data.deviceId).slice(0, 128) : null;
  if (code.length < 4) return fail("NOT_FOUND");

  const codeRef = db.doc(`codes/${code}`);
  return db.runTransaction(async (t) => {
    const codeSnap = await t.get(codeRef);
    if (!codeSnap.exists) return fail("NOT_FOUND");
    const c = codeSnap.data() as CodeDoc;

    const lotRef = db.doc(`lots/${c.lotId}`);
    const lotSnap = await t.get(lotRef);
    if (!lotSnap.exists) return fail("NOT_FOUND");
    const lot = lotSnap.data() as LotDoc;
    const now = Timestamp.now();

    if (c.status === "USED") return fail("ALREADY_USED");
    if (c.status === "CANCELLED" || lot.status === "CANCELLED") return fail("CANCELLED");
    if (c.status === "EXPIRED" || (lot.expiresAt && lot.expiresAt.toMillis() <= now.toMillis())) {
      if (c.status === "ACTIVE") t.update(codeRef, { status: "EXPIRED" });
      return fail("EXPIRED");
    }
    if (lot.validFrom && lot.validFrom.toMillis() > now.toMillis()) return fail("NOT_YET_VALID");

    const profSnap = await t.get(db.doc(`profiles/${student}`));
    const prof = (profSnap.data() ?? {}) as Partial<ProfileDoc>;
    if (lot.minLevel !== null && (prof.level ?? 1) < lot.minLevel) return fail("LEVEL_TOO_LOW");
    if (lot.maxTotalUses !== null && lot.usedCount >= lot.maxTotalUses) return fail("PROMOTION_EXHAUSTED");

    const txCol = db.collection("transactions");
    const today = startOfToday();
    if (lot.maxCodesPerStudentPerDay !== null) {
      const q = await t.get(txCol.where("studentId", "==", student).where("lotId", "==", c.lotId).where("createdAt", ">=", today));
      if (q.size >= lot.maxCodesPerStudentPerDay) return fail("DAILY_LIMIT");
    }

    let points = 0;
    let quantity = 0;
    let counterKey: string;
    if (lot.valueType === "points" || lot.valueType === "bonus") {
      points = lot.valueAmount; counterKey = "points";
    } else if (lot.valueType === "quantity" || lot.valueType === "product") {
      quantity = lot.valueAmount; counterKey = lot.productKey ?? lot.name.toUpperCase();
    } else {
      quantity = 1; counterKey = `promo:${lot.promotionId ?? c.lotId}`;
    }

    if (lot.maxPointsPerStudentPerDay !== null && points > 0) {
      const q = await t.get(txCol.where("studentId", "==", student).where("createdAt", ">=", today));
      const todayPts = q.docs.reduce((s, d) => s + Number(d.data().points ?? 0), 0);
      if (todayPts + points > lot.maxPointsPerStudentPerDay) return fail("DAILY_POINTS_LIMIT");
    }

    const goalsCol = db.collection("goals").where("active", "==", true);
    const [goalsSnap, stampGoalsSnap, appSnap, productSnap] = await Promise.all([
      t.get(goalsCol.where("counterKey", "==", counterKey)),
      t.get(goalsCol.where("counterKey", "==", STAMPS_KEY)),
      t.get(db.doc("settings/app")),
      lot.productId ? t.get(db.doc(`products/${lot.productId}`)) : Promise.resolve(null),
    ]);
    const product = productSnap?.exists ? (productSnap.data() as ProductDoc) : null;
    const stampsKey = lot.productId && product ? productStampsKey(lot.productId) : STAMPS_KEY;
    const expiryDays = Number(appSnap.data()?.rewardExpiryDays ?? 0);
    const rewardExpiresAt = expiryDays > 0 ? Timestamp.fromMillis(now.toMillis() + expiryDays * 86_400_000) : null;
    const counterRef = db.doc(`counters/${student}`);
    const counterSnap = await t.get(counterRef);
    const oldVal = Number(counterSnap.data()?.[counterKey] ?? 0);
    const delta = counterKey === "points" ? points : quantity;
    const newVal = oldVal + delta;
    const oldStamps = Number(counterSnap.data()?.[stampsKey] ?? 0);
    const newStamps = oldStamps + 1;

    const txId = await nextSeq(t, "tx");
    const txRef = txCol.doc(String(txId).padStart(8, "0"));

    // === cambio stato atomico ===
    t.update(codeRef, { status: "USED", usedBy: student, usedAt: now, transactionId: txId });
    t.update(lotRef, { usedCount: FieldValue.increment(1) });
    t.create(txRef, {
      txNumber: txId,
      codeId: code,
      codeValue: code,
      studentId: student,
      studentName: prof.fullName ?? null,
      lotId: c.lotId,
      lotName: lot.name,
      promotionId: lot.promotionId,
      productKey: lot.productKey,
      valueType: lot.valueType,
      points,
      quantity,
      deviceId,
      status: "OK",
      createdAt: now,
    });
    t.set(counterRef, { [counterKey]: newVal, [stampsKey]: newStamps, updatedAt: now }, { merge: true });

    const unlocked: { goal: string; reward: string; target: number }[] = [];
    const stampGoals: { id: string; goal: GoalDoc }[] = product && lot.productId
      ? [{ id: lot.productId, goal: { name: product.name, counterKey: stampsKey, target: product.stampTarget, reward: product.reward, active: true } }]
      : stampGoalsSnap.empty
        ? [{ id: STAMPS_KEY, goal: DEFAULT_STAMP_GOAL as GoalDoc }]
        : stampGoalsSnap.docs.map((g) => ({ id: g.id, goal: g.data() as GoalDoc }));
    const checks = [
      ...goalsSnap.docs.map((g) => ({ id: g.id, goal: g.data() as GoalDoc, oldV: oldVal, newV: newVal })),
      ...stampGoals.map((s) => ({ ...s, oldV: oldStamps, newV: newStamps })),
    ];
    for (const { id, goal, oldV, newV } of checks) {
      if (goal.target > 0 && Math.floor(newV / goal.target) > Math.floor(oldV / goal.target)) {
        t.create(db.collection("rewards").doc(), { studentId: student, goalId: id, goalName: goal.name, reward: goal.reward, productId: goal.counterKey === stampsKey ? lot.productId : null, unlockedAt: now, redeemedAt: null, expiresAt: rewardExpiresAt });
        t.create(db.collection("notifications").doc(), {
          type: "GOAL_REACHED",
          title: "OBIETTIVO RAGGIUNTO",
          body: { student_id: student, student_name: prof.fullName ?? student, goal: goal.name, target: goal.target, reward: goal.reward, date: now.toDate().toISOString() },
          readAt: null,
          createdAt: now,
        });
        unlocked.push({ goal: goal.name, reward: goal.reward, target: goal.target });
      }
    }

    const nextGoal = goalsSnap.docs.map((g) => g.data() as GoalDoc).sort((a, b) => a.target - b.target)[0];
    return {
      ok: true as const,
      transaction_id: txId,
      lot_name: lot.name,
      value_type: lot.valueType,
      counter_key: counterKey,
      points,
      quantity,
      new_balance: newVal,
      stamps: newStamps,
      next_goal: nextGoal ? { name: nextGoal.name, target: nextGoal.target, reward: nextGoal.reward } : null,
      unlocked,
    };
  });
});

// ---------------------------------------------------------------- redeemReward

export const redeemReward = onCall(async (req) => {
  const student = uid(req);
  const id = String(req.data?.rewardId ?? "");
  await db.runTransaction(async (t) => {
    const ref = db.doc(`rewards/${id}`);
    const snap = await t.get(ref);
    if (!snap.exists || snap.data()?.studentId !== student) throw new HttpsError("not-found", "Premio non trovato");
    if (snap.data()?.redeemedAt) throw new HttpsError("failed-precondition", "Premio già riscattato");
    if (snap.data()?.requestedAt) throw new HttpsError("failed-precondition", "REWARD_REQUESTED");
    const exp = snap.data()?.expiresAt as Timestamp | null | undefined;
    if (exp && exp.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "REWARD_EXPIRED");
    const prof = (await t.get(db.doc(`profiles/${student}`))).data() ?? {};
    const now = Timestamp.now();
    t.update(ref, { requestedAt: now });
    t.create(db.collection("notifications").doc(), {
      type: "REWARD_REQUEST",
      title: "RICHIESTA PREMIO",
      rewardId: id,
      body: { reward_id: id, student_id: student, student_name: prof.fullName ?? student, reward: snap.data()?.reward, date: now.toDate().toISOString() },
      readAt: null,
      createdAt: now,
    });
  });
  return { ok: true };
});

// ---------------------------------------------------------------- confirmReward (admin)

export const confirmReward = onCall(async (req) => {
  await requireAdmin(req);
  const id = String(req.data?.rewardId ?? "");
  await db.runTransaction(async (t) => {
    const ref = db.doc(`rewards/${id}`);
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Premio non trovato");
    if (snap.data()?.redeemedAt) throw new HttpsError("failed-precondition", "Premio già riscattato");
    if (!snap.data()?.requestedAt) throw new HttpsError("failed-precondition", "Premio non richiesto dallo studente");
    const notifs = await t.get(db.collection("notifications").where("rewardId", "==", id));
    const now = Timestamp.now();
    t.update(ref, { redeemedAt: now });
    notifs.docs.forEach((n) => t.update(n.ref, { readAt: now }));
  });
  return { ok: true };
});

// ---------------------------------------------------------------- lot stats (admin)

export const lotStats = onCall(async (req) => {
  await requireAdmin(req);
  const lotId = req.data?.lotId ? String(req.data.lotId) : null;
  const snap = lotId ? [await db.doc(`lots/${lotId}`).get()] : (await db.collection("lots").orderBy("createdAt", "desc").get()).docs;
  const out = [];
  for (const d of snap) {
    if (!d.exists) continue;
    const l = d.data() as LotDoc;
    const [used, expired, cancelled] = await Promise.all(
      (["USED", "EXPIRED", "CANCELLED"] as CodeStatus[]).map(async (s) =>
        (await db.collection("codes").where("lotId", "==", d.id).where("status", "==", s).count().get()).data().count,
      ),
    );
    const expiredNow = l.expiresAt && l.expiresAt.toMillis() <= Date.now();
    const available = expiredNow ? 0 : Math.max(0, l.totalCodes - used - expired - cancelled);
    const expiredCount = expiredNow ? l.totalCodes - used - cancelled : expired;
    out.push({
      id: d.id,
      ...l,
      validFrom: l.validFrom?.toDate().toISOString() ?? null,
      expiresAt: l.expiresAt?.toDate().toISOString() ?? null,
      createdAt: l.createdAt.toDate().toISOString(),
      usedCount: used,
      availableCount: available,
      expiredCount,
      cancelledCount: cancelled,
      usagePercent: l.totalCodes ? Math.round((used / l.totalCodes) * 10000) / 100 : 0,
    });
  }
  return out;
});
