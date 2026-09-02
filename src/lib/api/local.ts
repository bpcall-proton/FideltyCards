import { randomCode, normalizeCode } from "../codegen";
import type {
  AdminNotification, AppSettings, Code, GenerateLotInput, Goal, IssuedCode, Lot, LoyaltyApi, PrinterSettings, Product, Promotion, RedeemResult,
  StudentStatus, Transaction, UnlockedReward, User,
} from "../types";
import { DEFAULT_SETTINGS, STAMPS_KEY, isRewardExpired, productStampsKey } from "../types";
import { activePromotions } from "../promotions";

/**
 * Backend demo in localStorage: replica le stesse regole della funzione SQL
 * `redeemCode`. Serve solo per provare l'app senza Firebase configurato.
 */

type LotRow = Omit<Lot, "usedCount" | "availableCount" | "expiredCount" | "cancelledCount" | "usagePercent">;
interface Store {
  currentUserId: string;
  lots: LotRow[];
  codes: Code[];
  transactions: Transaction[];
  counters: Record<string, Record<string, number>>;
  goals: Goal[];
  rewards: Record<string, UnlockedReward[]>;
  notifications: AdminNotification[];
  txSeq: number;
  settings: AppSettings;
  products: (Product & { printLotId?: string })[];
  printers: PrinterSettings;
}

const KEY = "fidelty-demo-store";
const uid = () => crypto.randomUUID();

const DEMO_USERS: User[] = [
  { id: "admin-1", name: "Admin", role: "admin", level: 99 },
  { id: "stud-18342", name: "Mario Rossi", role: "student", level: 1 },
  { id: "stud-18343", name: "Giulia Bianchi", role: "student", level: 2 },
];

function fresh(): Store {
  return {
    currentUserId: "admin-1",
    lots: [], codes: [], transactions: [], counters: {}, rewards: {}, notifications: [], txSeq: 983420,
    settings: { ...DEFAULT_SETTINGS, stampReward: "Caffè gratis" },
    products: [],
    printers: { printers: [] },
    goals: [
      { id: uid(), name: "300 punti", counterKey: "points", target: 300, reward: "Caffè gratis" },
      { id: uid(), name: "5 caffè", counterKey: "CAFFE", target: 5, reward: "Caffè gratis" },
    ],
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<Store>) };
  } catch { /* ignore */ }
  return fresh();
}
function save(s: Store) { localStorage.setItem(KEY, JSON.stringify(s)); }

export class LocalApi implements LoyaltyApi {
  readonly mode = "demo" as const;
  private s: Store = load();

  private user(): User { return DEMO_USERS.find((u) => u.id === this.s.currentUserId) ?? DEMO_USERS[0]; }
  private requireAdmin() { if (this.user().role !== "admin") throw new Error("FORBIDDEN"); }

  demoUsers() { return DEMO_USERS; }
  async switchDemoUser(id: string) { this.s.currentUserId = id; save(this.s); return this.user(); }
  async currentUser() { return this.user(); }
  async signIn() { return this.user(); }
  async signUp() { return this.user(); }
  async signOut() { this.s.currentUserId = DEMO_USERS[1].id; save(this.s); }
  async updateName(fullName: string) { const u = this.user(); u.name = fullName; return u; }

  private stats(l: LotRow): Lot {
    const cs = this.s.codes.filter((c) => c.lotId === l.id);
    const expired = l.expiresAt ? new Date(l.expiresAt) <= new Date() : false;
    const used = cs.filter((c) => c.status === "USED").length;
    const active = cs.filter((c) => c.status === "ACTIVE").length;
    return {
      ...l,
      usedCount: used,
      availableCount: expired ? 0 : active,
      expiredCount: cs.filter((c) => c.status === "EXPIRED").length + (expired ? active : 0),
      cancelledCount: cs.filter((c) => c.status === "CANCELLED").length,
      usagePercent: cs.length ? Math.round((10000 * used) / cs.length) / 100 : 0,
    };
  }

  async generateLot(i: GenerateLotInput): Promise<Lot> {
    this.requireAdmin();
    if (i.quantity < 1 || i.quantity > 500000) throw new Error("INVALID_QUANTITY");
    const year = new Date().getFullYear();
    const seq = this.s.lots.filter((l) => l.createdAt.startsWith(String(year))).length + 1;
    const len = Math.max(i.codeLength, i.quantity > 100000 ? 8 : 6);
    const lot: LotRow = {
      id: uid(), lotNumber: `${year}-${String(seq).padStart(3, "0")}`, name: i.name, valueType: i.valueType,
      valueAmount: i.valueAmount, productKey: i.productKey?.toUpperCase() || undefined, productId: i.productId, promotionId: i.promotionId,
      codeFormat: i.codeFormat, codeLength: len, totalCodes: i.quantity, validFrom: i.validFrom, expiresAt: i.expiresAt,
      status: "ACTIVE", maxCodesPerStudentPerDay: i.maxCodesPerStudentPerDay, maxPointsPerStudentPerDay: i.maxPointsPerStudentPerDay,
      maxTotalUses: i.maxTotalUses, minLevel: i.minLevel, createdAt: new Date().toISOString(),
    };
    const existing = new Set(this.s.codes.map((c) => c.code));
    const codes: Code[] = [];
    while (codes.length < i.quantity) {
      const c = randomCode(i.codeFormat, len);
      if (existing.has(c)) continue;
      existing.add(c);
      codes.push({ id: uid(), lotId: lot.id, code: c, status: "ACTIVE" });
    }
    this.s.lots.unshift(lot);
    this.s.codes.push(...codes);
    save(this.s);
    return this.stats(lot);
  }

  async listLots() { this.requireAdmin(); return this.s.lots.map((l) => this.stats(l)); }
  async getLot(id: string) { const l = this.s.lots.find((x) => x.id === id); return l ? this.stats(l) : null; }
  async listCodes(lotId: string) { this.requireAdmin(); return this.s.codes.filter((c) => c.lotId === lotId); }
  async listTransactions(lotId?: string) {
    const me = this.user();
    return this.s.transactions
      .filter((t) => (!lotId || t.lotId === lotId) && (me.role === "admin" || t.studentId === me.id))
      .slice().reverse();
  }

  async cancelCode(code: string) {
    this.requireAdmin();
    const c = this.s.codes.find((x) => x.code === normalizeCode(code));
    if (c && c.status === "ACTIVE") c.status = "CANCELLED";
    save(this.s);
  }
  async cancelLot(lotId: string) {
    this.requireAdmin();
    const l = this.s.lots.find((x) => x.id === lotId);
    if (l) l.status = "CANCELLED";
    this.s.codes.forEach((c) => { if (c.lotId === lotId && c.status === "ACTIVE") c.status = "CANCELLED"; });
    save(this.s);
  }
  async deleteLot(lotId: string) {
    this.requireAdmin();
    const l = this.s.lots.find((x) => x.id === lotId);
    if (!l) return;
    const expired = !!l.expiresAt && new Date(l.expiresAt).getTime() <= Date.now();
    if (l.status === "ACTIVE" && !expired) throw new Error("LOT_ACTIVE");
    this.s.lots = this.s.lots.filter((x) => x.id !== lotId);
    this.s.codes = this.s.codes.filter((c) => c.lotId !== lotId);
    this.s.products.forEach((p) => { if (p.printLotId === lotId) p.printLotId = undefined; });
    save(this.s);
  }
  async cancelPromotion(promotionId: string) {
    this.requireAdmin();
    for (const l of this.s.lots.filter((x) => x.promotionId === promotionId)) await this.cancelLot(l.id);
  }
  async listNotifications() { this.requireAdmin(); return this.s.notifications.slice().reverse(); }
  async listGoals() { return this.s.goals.slice().sort((a, b) => a.target - b.target); }
  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) {
    this.requireAdmin();
    const idx = this.s.goals.findIndex((x) => x.id === g.id);
    if (idx >= 0) this.s.goals[idx] = { ...(g as Goal) };
    else this.s.goals.push({ ...g, id: uid() });
    save(this.s);
  }
  async deleteGoal(id: string) { this.requireAdmin(); this.s.goals = this.s.goals.filter((g) => g.id !== id); save(this.s); }

  async listProducts() { return this.s.products.slice(); }
  async saveProduct(p: Omit<Product, "id"> & { id?: string }) {
    this.requireAdmin();
    const idx = this.s.products.findIndex((x) => x.id === p.id);
    if (idx >= 0) this.s.products[idx] = { ...this.s.products[idx], ...p, id: this.s.products[idx].id };
    else this.s.products.push({ ...p, id: uid() });
    save(this.s);
  }
  async deleteProduct(id: string) { this.requireAdmin(); const p = this.s.products.find((x) => x.id === id); if (p) p.active = false; save(this.s); }
  async issueCode(input: { productId?: string; lotId?: string }): Promise<IssuedCode> {
    this.requireAdmin();
    const p = input.productId ? this.s.products.find((x) => x.id === input.productId) : undefined;
    let lot = this.s.lots.find((l) => l.id === (input.lotId ?? p?.printLotId) && l.status === "ACTIVE");
    if (!lot) {
      if (!p) throw new Error("NOT_FOUND");
      lot = (await this.generateLot({ name: `${p.name} — stampa`, valueType: "product", valueAmount: 1, quantity: 1, codeFormat: "numeric_qr", codeLength: 8, productKey: p.name, productId: p.id })) as LotRow;
      p.printLotId = lot.id;
      this.s.codes.pop();
    }
    const existing = new Set(this.s.codes.map((c) => c.code));
    let code = randomCode(lot.codeFormat, lot.codeLength);
    while (existing.has(code)) code = randomCode(lot.codeFormat, lot.codeLength);
    this.s.codes.push({ id: uid(), lotId: lot.id, code, status: "ACTIVE", printedAt: new Date().toISOString() });
    lot.totalCodes += 1;
    save(this.s);
    return { code, lotId: lot.id, lotName: lot.name, productName: p?.name ?? lot.productKey ?? lot.name, reward: p?.reward ?? null, stampTarget: p?.stampTarget ?? null };
  }
  async printNextCodes(lotId: string, count: number) {
    this.requireAdmin();
    const lot = this.s.lots.find((l) => l.id === lotId && l.status === "ACTIVE");
    if (!lot) throw new Error("LOT_NOT_ACTIVE");
    const p = lot.productId ? this.s.products.find((x) => x.id === lot.productId) : undefined;
    const unprinted = this.s.codes.filter((c) => c.lotId === lotId && c.status === "ACTIVE" && !c.printedAt);
    const picked = unprinted.slice(0, Math.max(1, count));
    const now = new Date().toISOString();
    picked.forEach((c) => { c.printedAt = now; });
    save(this.s);
    const productName = p?.name ?? lot.productKey ?? lot.name;
    return {
      codes: picked.map((c) => ({ code: c.code, lotId, lotName: lot.name, productName, reward: p?.reward ?? null, stampTarget: p?.stampTarget ?? null })),
      remainingUnprinted: unprinted.length - picked.length,
    };
  }
  async getPrinters() { return this.s.printers; }
  async savePrinters(s: PrinterSettings) { this.requireAdmin(); this.s.printers = s; save(this.s); }

  async redeemCode(raw: string, deviceId?: string): Promise<RedeemResult> {
    const me = this.user();
    const value = normalizeCode(raw);
    if (value.length < 4) return { ok: false, error: "NOT_FOUND" };
    const code = this.s.codes.find((c) => c.code === value);
    if (!code) return { ok: false, error: "NOT_FOUND" };
    const lot = this.s.lots.find((l) => l.id === code.lotId)!;
    const now = new Date();

    if (code.status === "USED") return { ok: false, error: "ALREADY_USED" };
    if (code.status === "CANCELLED" || lot.status === "CANCELLED") return { ok: false, error: "CANCELLED" };
    if (code.status === "EXPIRED" || (lot.expiresAt && new Date(lot.expiresAt) <= now)) {
      code.status = "EXPIRED"; save(this.s);
      return { ok: false, error: "EXPIRED" };
    }
    if (lot.validFrom && new Date(lot.validFrom) > now) return { ok: false, error: "NOT_YET_VALID" };
    if (lot.minLevel && me.level < lot.minLevel) return { ok: false, error: "LEVEL_TOO_LOW" };
    if (lot.maxTotalUses && this.s.codes.filter((c) => c.lotId === lot.id && c.status === "USED").length >= lot.maxTotalUses)
      return { ok: false, error: "PROMOTION_EXHAUSTED" };

    const today = now.toISOString().slice(0, 10);
    const myToday = this.s.transactions.filter((t) => t.studentId === me.id && t.createdAt.startsWith(today));
    if (lot.maxCodesPerStudentPerDay && myToday.filter((t) => t.lotId === lot.id).length >= lot.maxCodesPerStudentPerDay)
      return { ok: false, error: "DAILY_LIMIT" };

    let points = 0, qty = 0, key: string;
    if (lot.valueType === "points" || lot.valueType === "bonus") { points = lot.valueAmount; key = "points"; }
    else if (lot.valueType === "quantity" || lot.valueType === "product") { qty = lot.valueAmount; key = lot.productKey ?? lot.name.toUpperCase(); }
    else { key = `promo:${lot.promotionId ?? lot.id}`; qty = 1; }

    if (lot.maxPointsPerStudentPerDay && points > 0 && myToday.reduce((a, t) => a + t.points, 0) + points > lot.maxPointsPerStudentPerDay)
      return { ok: false, error: "DAILY_POINTS_LIMIT" };

    // cambio stato (in JS single-thread è già atomico)
    if (code.status !== "ACTIVE") return { ok: false, error: "ALREADY_USED" };
    code.status = "USED"; code.usedBy = me.id; code.usedAt = now.toISOString();
    const txId = ++this.s.txSeq;
    code.transactionId = txId;
    this.s.transactions.push({
      id: txId, codeId: code.id, codeValue: code.code, studentId: me.id, studentName: me.name, lotId: lot.id,
      promotionId: lot.promotionId, productKey: lot.productKey, valueType: lot.valueType, points, quantity: qty,
      deviceId, status: "OK", createdAt: now.toISOString(),
    });

    const counters = (this.s.counters[me.id] ??= {});
    const delta = key === "points" ? points : qty;
    const oldVal = counters[key] ?? 0;
    const newVal = oldVal + delta;
    counters[key] = newVal;
    const product = lot.productId ? this.s.products.find((p) => p.id === lot.productId) : undefined;
    const stampsKey = product ? productStampsKey(product.id) : STAMPS_KEY;
    const oldStamps = counters[stampsKey] ?? 0;
    const newStamps = oldStamps + 1;
    counters[stampsKey] = newStamps;

    const unlocked: { goal: string; reward: string; target: number }[] = [];
    const st = this.s.settings;
    const stampGoal = product
      ? { id: product.id, name: product.name, counterKey: stampsKey, target: product.stampTarget, reward: product.reward }
      : { id: STAMPS_KEY, name: STAMPS_KEY, counterKey: STAMPS_KEY, target: st.stampTarget, reward: st.stampReward };
    const checks = [
      ...this.s.goals.filter((g) => g.counterKey === key).map((g) => ({ g, o: oldVal, n: newVal })),
      { g: stampGoal, o: oldStamps, n: newStamps },
    ];
    for (const { g, o, n } of checks) {
      if (g.target > 0 && Math.floor(n / g.target) > Math.floor(o / g.target)) {
        (this.s.rewards[me.id] ??= []).push({
          id: uid(), reward: g.reward, productId: g.counterKey === stampsKey ? product?.id : undefined, unlockedAt: now.toISOString(),
          expiresAt: st.rewardExpiryDays > 0 ? new Date(now.getTime() + st.rewardExpiryDays * 86_400_000).toISOString() : undefined,
        });
        this.s.notifications.push({
          id: uid(), type: "GOAL_REACHED", title: "OBIETTIVO RAGGIUNTO", createdAt: now.toISOString(),
          body: { student_id: me.id, student_name: me.name, goal: g.name, target: g.target, reward: g.reward, date: now.toISOString() },
        });
        unlocked.push({ goal: g.name, reward: g.reward, target: g.target });
      }
    }
    save(this.s);
    const next = this.s.goals.filter((g) => g.counterKey === key).sort((a, b) => a.target - b.target)[0];
    return {
      ok: true, transaction_id: txId, lot_name: lot.name, value_type: lot.valueType, counter_key: key, points, quantity: qty,
      new_balance: newVal, next_goal: next ? { name: next.name, target: next.target, reward: next.reward } : null, unlocked,
    };
  }

  async myStatus(): Promise<StudentStatus> {
    const me = this.user();
    return { counters: this.s.counters[me.id] ?? {}, goals: await this.listGoals(), products: this.s.products.filter((p) => p.active), rewards: (this.s.rewards[me.id] ?? []).slice().reverse(), settings: this.s.settings };
  }
  async getSettings() { return this.s.settings; }
  async saveSettings(s: AppSettings) { this.requireAdmin(); this.s.settings = s; save(this.s); }
  async listPromotions(): Promise<Promotion[]> { return activePromotions(this.s.lots); }
  async redeemReward(id: string) {
    const me = this.user();
    const r = (this.s.rewards[me.id] ?? []).find((x) => x.id === id);
    if (r && !r.redeemedAt && !r.requestedAt && !isRewardExpired(r)) {
      const now = new Date().toISOString();
      r.requestedAt = now;
      this.s.notifications.push({
        id: uid(), type: "REWARD_REQUEST", title: "RICHIESTA PREMIO", createdAt: now,
        body: { reward_id: id, student_id: me.id, student_name: me.name, reward: r.reward, date: now },
      });
    }
    save(this.s);
  }
  async confirmReward(id: string) {
    this.requireAdmin();
    const r = Object.values(this.s.rewards).flat().find((x) => x.id === id);
    if (r && r.requestedAt && !r.redeemedAt) {
      const now = new Date().toISOString();
      r.redeemedAt = now;
      this.s.notifications.filter((n) => n.body.reward_id === id).forEach((n) => { n.readAt = now; });
    }
    save(this.s);
  }
}
