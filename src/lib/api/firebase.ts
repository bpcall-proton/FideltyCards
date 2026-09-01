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
  AdminNotification, Code, GenerateLotInput, Goal, Lot, LoyaltyApi, RedeemResult, StudentStatus, Transaction, User,
} from "../types";

const iso = (v: unknown): string | undefined =>
  v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : undefined;

const mapLot = (r: DocumentData): Lot => ({
  id: r.id,
  lotNumber: r.lotNumber,
  name: r.name,
  valueType: r.valueType,
  valueAmount: r.valueAmount,
  productKey: r.productKey ?? undefined,
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

const mapGoal = (id: string, g: DocumentData): Goal => ({ id, name: g.name, counterKey: g.counterKey, target: g.target, reward: g.reward });

export class FirebaseApi implements LoyaltyApi {
  readonly mode = "firebase" as const;
  private auth: Auth;
  private db: Firestore;
  private fns: Functions;
  private ready: Promise<void>;

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
    return { id: u.uid, name: d?.fullName ?? u.displayName ?? u.email ?? "", role: d?.role ?? "student", level: d?.level ?? 1 };
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
    await setDoc(doc(this.db, "profiles", user.uid), { fullName, role: "student", level: 1, createdAt: Timestamp.now() });
    return this.profile(user);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
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
    const q = lotId
      ? query(col, where("lotId", "==", lotId), orderBy("createdAt", "desc"), limit(500))
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
    return snap.docs.map((d) => mapGoal(d.id, d.data()));
  }

  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) {
    const row = { name: g.name, counterKey: g.counterKey, target: g.target, reward: g.reward, active: true };
    if (g.id) await updateDoc(doc(this.db, "goals", g.id), row);
    else await addDoc(collection(this.db, "goals"), row);
  }

  async deleteGoal(id: string) { await deleteDoc(doc(this.db, "goals", id)); }

  async redeemCode(code: string, deviceId?: string): Promise<RedeemResult> {
    return this.call<{ code: string; deviceId?: string }, RedeemResult>("redeemCode")({ code, deviceId });
  }

  async myStatus(): Promise<StudentStatus> {
    const u = this.auth.currentUser;
    if (!u) throw new Error("NOT_AUTHENTICATED");
    const [counters, goals, rewards] = await Promise.all([
      getDoc(doc(this.db, "counters", u.uid)),
      getDocs(query(collection(this.db, "goals"), where("active", "==", true), orderBy("target"))),
      getDocs(query(collection(this.db, "rewards"), where("studentId", "==", u.uid), orderBy("unlockedAt", "desc"))),
    ]);
    const c: Record<string, number> = {};
    for (const [k, v] of Object.entries(counters.data() ?? {})) if (typeof v === "number") c[k] = v;
    return {
      counters: c,
      goals: goals.docs.map((d) => mapGoal(d.id, d.data())),
      rewards: rewards.docs.map((d) => {
        const r = d.data();
        return { id: d.id, reward: r.reward, unlockedAt: iso(r.unlockedAt) ?? "", redeemedAt: iso(r.redeemedAt) };
      }),
    };
  }

  async redeemReward(id: string) { await this.call<{ rewardId: string }, unknown>("redeemReward")({ rewardId: id }); }
}
