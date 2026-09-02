import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updateProfile, type Auth, type User as FbUser,
} from "firebase/auth";
import {
  Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, orderBy, query,
  setDoc, startAfter, updateDoc, where, type DocumentData, type Firestore, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import type {
  AdminNotification, AppSettings, Code, GenerateLotInput, Goal, IssuedCode, Lot, LoyaltyApi, Printer, PrinterSettings, Product, Promotion, RedeemResult, StudentStatus, Transaction, User,
} from "../types";
import { DEFAULT_SETTINGS, STAMPS_KEY } from "../types";
import { activePromotions } from "../promotions";

const iso = (v: unknown): string | undefined =>
  v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : undefined;

const mapLot = (r: DocumentData): Lot => ({
  id: r.id,
  lotNumber: r.lotNumber,
  name: r.name,
  valueType: r.valueType,
  valueAmount: r.valueAmount,
  productKey: r.productKey ?? undefined,
  productId: r.productId ?? undefined,
  promotionId: r.promotionId ?? undefined,
  codeFormat: r.codeFormat,
  codeLength: r.codeLength,
  totalCodes: r.totalCodes,
  validFrom: iso(r.validFrom),
  expiresAt: iso(r.expiresAt),
  status: r.status,
  maxCodesPerStudentPerDay: r.maxCodesPerStudentPerDay ?? undefined,
  maxPointsPerStudentPerDay: r.maxPointsPerStudentPerDay ?? undefined,
  maxTotalUses: r.maxTotalUses ?? undefined,
  minLevel: r.minLevel ?? undefined,
  createdAt: iso(r.createdAt) ?? "",
  usedCount: Number(r.usedCount ?? 0),
  availableCount: Number(r.availableCount ?? 0),
  expiredCount: Number(r.expiredCount ?? 0),
  cancelledCount: Number(r.cancelledCount ?? 0),
  usagePercent: Number(r.usagePercent ?? 0),
});

const mapProduct = (id: string, p: DocumentData): Product => ({ id, name: p.name, stampTarget: Number(p.stampTarget ?? 10), reward: p.reward ?? "", active: p.active !== false });

const mapGoal = (id: string, g: DocumentData): Goal => ({ id, name: g.name, counterKey: g.counterKey, target: g.target, reward: g.reward });

export class FirebaseApi implements LoyaltyApi {
  readonly mode = "firebase" as const;
  private auth: Auth;
  private db: Firestore;
  private fns: Functions;
  private ready: Promise<void>;
  private role: User["role"] = "student";

  constructor(options: FirebaseOptions, region = "europe-west1") {
    const app = initializeApp(options);
    this.auth = getAuth(app);
    this.db = getFirestore(app);
    this.fns = getFunctions(app, region);
    this.ready = new Promise((res) => {
      const off = onAuthStateChanged(this.auth, () => { off(); res(); });
    });
  }

  private call<TReq, TRes>(name: string) {
    return async (data: TReq): Promise<TRes> => (await httpsCallable<TReq, TRes>(this.fns, name)(data)).data;
  }

  private async profile(u: FbUser): Promise<User> {
    const snap = await getDoc(doc(this.db, "profiles", u.uid));
    const d = snap.data();
    this.role = d?.role ?? "student";
    return { id: u.uid, name: d?.fullName ?? u.displayName ?? u.email ?? "", role: this.role, level: d?.level ?? 1, email: u.email ?? undefined };
  }

  async currentUser(): Promise<User | null> {
    await this.ready;
    return this.auth.currentUser ? this.profile(this.auth.currentUser) : null;
  }

  async signIn(email: string, password: string): Promise<User> {
    const { user } = await signInWithEmailAndPassword(this.auth, email, password);
    return this.profile(user);
  }

  async signUp(email: string, password: string, fullName: string): Promise<User> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(user, { displayName: fullName });
    const ref = doc(this.db, "profiles", user.uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await setDoc(ref, { fullName }, { merge: true });
    } else {
      await setDoc(ref, { fullName, role: "student", level: 1, createdAt: Timestamp.now() });
    }
    return this.profile(user);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async updateName(fullName: string): Promise<User> {
    const u = this.auth.currentUser;
    if (!u) throw new Error("NOT_AUTHENTICATED");
    await updateProfile(u, { displayName: fullName });
    await setDoc(doc(this.db, "profiles", u.uid), { fullName }, { merge: true });
    return this.profile(u);
  }

  async generateLot(i: GenerateLotInput): Promise<Lot> {
    const { lotId } = await this.call<GenerateLotInput, { lotId: string }>("generateCodeLot")(i);
    const lot = await this.getLot(lotId);
    if (!lot) throw new Error("LOT_NOT_FOUND");
    return lot;
  }

  async listLots(): Promise<Lot[]> {
    const rows = await this.call<Record<string, never>, DocumentData[]>("lotStats")({});
    return rows.map(mapLot);
  }

  async getLot(id: string): Promise<Lot | null> {
    const rows = await this.call<{ lotId: string }, DocumentData[]>("lotStats")({ lotId: id });
    return rows[0] ? mapLot(rows[0]) : null;
  }

  async listCodes(lotId: string): Promise<Code[]> {
    const out: Code[] = [];
    const page = 1000;
    let cursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      const base = query(collection(this.db, "codes"), where("lotId", "==", lotId), orderBy("createdAt"), orderBy("__name__"), limit(page));
      const snap = await getDocs(cursor ? query(base, startAfter(cursor)) : base);
      for (const d of snap.docs) {
        const r = d.data();
        out.push({ id: d.id, lotId: r.lotId, code: d.id, status: r.status, usedBy: r.usedBy ?? undefined, usedAt: iso(r.usedAt), transactionId: r.transactionId ?? undefined });
      }
      if (snap.size < page) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return out;
  }

  async listTransactions(lotId?: string): Promise<Transaction[]> {
    const col = collection(this.db, "transactions");
    const uid = this.auth.currentUser?.uid;
    const q = lotId
      ? query(col, where("lotId", "==", lotId), orderBy("createdAt", "desc"), limit(500))
      : this.role !== "admin" && uid
        ? query(col, where("studentId", "==", uid), orderBy("createdAt", "desc"), limit(500))
        : query(col, orderBy("createdAt", "desc"), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const r = d.data();
      return {
        id: r.txNumber ?? d.id, codeId: r.codeId, codeValue: r.codeValue, studentId: r.studentId,
        studentName: r.studentName ?? undefined, lotId: r.lotId, promotionId: r.promotionId ?? undefined,
        productKey: r.productKey ?? undefined, valueType: r.valueType, points: r.points, quantity: r.quantity,
        deviceId: r.deviceId ?? undefined, status: r.status, createdAt: iso(r.createdAt) ?? "",
      };
    });
  }

  async cancelCode(code: string) { await this.call<{ code: string }, unknown>("cancelCode")({ code }); }
  async cancelLot(lotId: string) { await this.call<{ lotId: string }, unknown>("cancelLot")({ lotId }); }
  async deleteLot(lotId: string) { await this.call<{ lotId: string }, unknown>("deleteLot")({ lotId }); }
  async cancelPromotion(promotionId: string) { await this.call<{ promotionId: string }, unknown>("cancelPromotion")({ promotionId }); }

  async listNotifications(): Promise<AdminNotification[]> {
    const snap = await getDocs(query(collection(this.db, "notifications"), orderBy("createdAt", "desc"), limit(100)));
    return snap.docs.map((d) => {
      const r = d.data();
      return { id: d.id, type: r.type, title: r.title, body: r.body ?? {}, readAt: iso(r.readAt), createdAt: iso(r.createdAt) ?? "" };
    });
  }

  async listGoals(): Promise<Goal[]> {
    const snap = await getDocs(query(collection(this.db, "goals"), where("active", "==", true), orderBy("target")));
    return snap.docs.map((d) => mapGoal(d.id, d.data())).filter((g) => g.counterKey !== STAMPS_KEY);
  }

  private settingsFrom(app: DocumentData | undefined, goals: Goal[]): AppSettings {
    const stamp = goals.find((g) => g.counterKey === STAMPS_KEY);
    return {
      stampTarget: stamp?.target ?? DEFAULT_SETTINGS.stampTarget,
      stampReward: stamp?.reward ?? DEFAULT_SETTINGS.stampReward,
      showPointsCard: app?.showPointsCard === true,
      rewardExpiryDays: Number(app?.rewardExpiryDays ?? 0),
    };
  }

  async getSettings(): Promise<AppSettings> {
    const [app, goals] = await Promise.all([
      getDoc(doc(this.db, "settings", "app")),
      getDocs(query(collection(this.db, "goals"), where("active", "==", true), where("counterKey", "==", STAMPS_KEY))),
    ]);
    return this.settingsFrom(app.data(), goals.docs.map((d) => mapGoal(d.id, d.data())));
  }

  async saveSettings(s: AppSettings) {
    await setDoc(doc(this.db, "settings", "app"), { showPointsCard: s.showPointsCard, rewardExpiryDays: s.rewardExpiryDays }, { merge: true });
    const snap = await getDocs(query(collection(this.db, "goals"), where("counterKey", "==", STAMPS_KEY)));
    const row = { name: "stamps", counterKey: STAMPS_KEY, target: s.stampTarget, reward: s.stampReward, active: true };
    if (snap.empty) await addDoc(collection(this.db, "goals"), row);
    else await Promise.all(snap.docs.map((d, i) => (i === 0 ? updateDoc(d.ref, row) : deleteDoc(d.ref))));
  }

  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) {
    const row = { name: g.name, counterKey: g.counterKey, target: g.target, reward: g.reward, active: true };
    if (g.id) await updateDoc(doc(this.db, "goals", g.id), row);
    else await addDoc(collection(this.db, "goals"), row);
  }

  async deleteGoal(id: string) { await deleteDoc(doc(this.db, "goals", id)); }

  async listProducts(): Promise<Product[]> {
    const snap = await getDocs(query(collection(this.db, "products"), orderBy("createdAt")));
    return snap.docs.map((d) => mapProduct(d.id, d.data()));
  }
  async saveProduct(p: Omit<Product, "id"> & { id?: string }) {
    const row = { name: p.name, stampTarget: p.stampTarget, reward: p.reward, active: p.active };
    if (p.id) await updateDoc(doc(this.db, "products", p.id), row);
    else await addDoc(collection(this.db, "products"), { ...row, printLotId: null, createdAt: Timestamp.now() });
  }
  async deleteProduct(id: string) { await updateDoc(doc(this.db, "products", id), { active: false }); }
  async issueCode(input: { productId?: string; lotId?: string }): Promise<IssuedCode> {
    return this.call<{ productId?: string; lotId?: string }, IssuedCode>("issueCode")(input);
  }
  async getPrinters(): Promise<PrinterSettings> {
    const snap = await getDoc(doc(this.db, "settings", "printers"));
    const d = snap.data();
    return { printers: Array.isArray(d?.printers) ? (d!.printers as Printer[]) : [], defaultId: d?.defaultId ?? undefined };
  }
  async savePrinters(s: PrinterSettings) {
    await setDoc(doc(this.db, "settings", "printers"), { printers: s.printers, defaultId: s.defaultId ?? null });
  }

  async redeemCode(code: string, deviceId?: string): Promise<RedeemResult> {
    return this.call<{ code: string; deviceId?: string }, RedeemResult>("redeemCode")({ code, deviceId });
  }

  async myStatus(): Promise<StudentStatus> {
    const u = this.auth.currentUser;
    if (!u) throw new Error("NOT_AUTHENTICATED");
    const [counters, goals, rewards, app, products] = await Promise.all([
      getDoc(doc(this.db, "counters", u.uid)),
      getDocs(query(collection(this.db, "goals"), where("active", "==", true), orderBy("target"))),
      getDocs(query(collection(this.db, "rewards"), where("studentId", "==", u.uid), orderBy("unlockedAt", "desc"))),
      getDoc(doc(this.db, "settings", "app")),
      getDocs(query(collection(this.db, "products"), where("active", "==", true))),
    ]);
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(counters.data() ?? {})) if (typeof v === "number") c[k] = v;
    const allGoals = goals.docs.map((d) => mapGoal(d.id, d.data()));
    return {
      counters: c,
      goals: allGoals.filter((g) => g.counterKey !== STAMPS_KEY),
      products: products.docs.map((d) => mapProduct(d.id, d.data())),
      settings: this.settingsFrom(app.data(), allGoals),
      rewards: rewards.docs.map((d) => {
        const r = d.data();
        return { id: d.id, reward: r.reward, productId: r.productId ?? undefined, unlockedAt: iso(r.unlockedAt) ?? "", requestedAt: iso(r.requestedAt), redeemedAt: iso(r.redeemedAt), expiresAt: iso(r.expiresAt) };
      }),
    };
  }

  async listPromotions(): Promise<Promotion[]> {
    const snap = await getDocs(query(collection(this.db, "lots"), where("status", "==", "ACTIVE")));
    return activePromotions(snap.docs.map((d) => ({ id: d.id, ...mapLot({ id: d.id, ...d.data() }) })));
  }

  async redeemReward(id: string) { await this.call<{ rewardId: string }, unknown>("redeemReward")({ rewardId: id }); }
  async confirmReward(id: string) { await this.call<{ rewardId: string }, unknown>("confirmReward")({ rewardId: id }); }
}
