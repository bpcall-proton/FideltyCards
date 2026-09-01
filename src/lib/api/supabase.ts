import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminNotification, Code, GenerateLotInput, Goal, Lot, LoyaltyApi, RedeemResult,
  StudentStatus, Transaction, User,
} from "../types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const mapLot = (r: Row): Lot => ({
  id: r.id,
  lotNumber: r.lot_number,
  name: r.name,
  valueType: r.value_type,
  valueAmount: r.value_amount,
  productKey: r.product_key ?? undefined,
  promotionId: r.promotion_id ?? undefined,
  codeFormat: r.code_format,
  codeLength: r.code_length,
  totalCodes: r.total_codes,
  validFrom: r.valid_from ?? undefined,
  expiresAt: r.expires_at ?? undefined,
  status: r.status,
  maxCodesPerStudentPerDay: r.max_codes_per_student_per_day ?? undefined,
  maxPointsPerStudentPerDay: r.max_points_per_student_per_day ?? undefined,
  maxTotalUses: r.max_total_uses ?? undefined,
  minLevel: r.min_level ?? undefined,
  createdAt: r.created_at,
  usedCount: Number(r.used_count ?? 0),
  availableCount: Number(r.available_count ?? 0),
  expiredCount: Number(r.expired_count ?? 0),
  cancelledCount: Number(r.cancelled_count ?? 0),
  usagePercent: Number(r.usage_percent ?? 0),
});

export class SupabaseApi implements LoyaltyApi {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey);
  }

  private async profile(id: string, fallbackName: string): Promise<User> {
    const { data } = await this.sb.from("profiles").select("full_name, role, level").eq("id", id).maybeSingle();
    return { id, name: data?.full_name ?? fallbackName, role: data?.role ?? "student", level: data?.level ?? 1 };
  }

  async currentUser(): Promise<User | null> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return null;
    return this.profile(data.user.id, data.user.email ?? "");
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return this.profile(data.user.id, data.user.email ?? "");
  }

  async signUp(email: string, password: string, fullName: string): Promise<User> {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    if (!data.user) throw new Error("Registrazione non completata: controlla l'email di conferma.");
    return this.profile(data.user.id, email);
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async generateLot(i: GenerateLotInput): Promise<Lot> {
    const { data, error } = await this.sb.rpc("generate_code_lot", {
      p_name: i.name,
      p_value_type: i.valueType,
      p_value_amount: i.valueAmount,
      p_quantity: i.quantity,
      p_code_format: i.codeFormat,
      p_code_length: i.codeLength,
      p_product_key: i.productKey ?? null,
      p_promotion_id: i.promotionId ?? null,
      p_valid_from: i.validFrom ?? null,
      p_expires_at: i.expiresAt ?? null,
      p_max_codes_per_student_per_day: i.maxCodesPerStudentPerDay ?? null,
      p_max_points_per_student_per_day: i.maxPointsPerStudentPerDay ?? null,
      p_max_total_uses: i.maxTotalUses ?? null,
      p_min_level: i.minLevel ?? null,
    });
    if (error) throw error;
    const lot = await this.getLot(data as string);
    if (!lot) throw new Error("Lotto non trovato dopo la generazione");
    return lot;
  }

  async listLots(): Promise<Lot[]> {
    const { data, error } = await this.sb.from("lot_stats").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapLot);
  }

  async getLot(id: string): Promise<Lot | null> {
    const { data, error } = await this.sb.from("lot_stats").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapLot(data) : null;
  }

  async listCodes(lotId: string): Promise<Code[]> {
    const out: Code[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await this.sb.from("codes").select("*").eq("lot_id", lotId).order("created_at").range(from, from + page - 1);
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({ id: r.id, lotId: r.lot_id, code: r.code, status: r.status, usedBy: r.used_by ?? undefined, usedAt: r.used_at ?? undefined, transactionId: r.transaction_id ?? undefined });
      }
      if (!data || data.length < page) break;
    }
    return out;
  }

  async listTransactions(lotId?: string): Promise<Transaction[]> {
    let q = this.sb.from("code_transactions").select("*, profiles:student_id(full_name)").order("created_at", { ascending: false }).limit(500);
    if (lotId) q = q.eq("lot_id", lotId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: Row) => ({
      id: r.id, codeId: r.code_id, codeValue: r.code_value, studentId: r.student_id,
      studentName: r.profiles?.full_name ?? undefined, lotId: r.lot_id, promotionId: r.promotion_id ?? undefined,
      productKey: r.product_key ?? undefined, valueType: r.value_type, points: r.points, quantity: r.quantity,
      deviceId: r.device_id ?? undefined, status: r.status, createdAt: r.created_at,
    }));
  }

  async cancelCode(code: string) { const { error } = await this.sb.rpc("cancel_code", { p_code: code }); if (error) throw error; }
  async cancelLot(lotId: string) { const { error } = await this.sb.rpc("cancel_lot", { p_lot_id: lotId }); if (error) throw error; }
  async cancelPromotion(id: string) { const { error } = await this.sb.rpc("cancel_promotion", { p_promotion_id: id }); if (error) throw error; }

  async listNotifications(): Promise<AdminNotification[]> {
    const { data, error } = await this.sb.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map((r: Row) => ({ id: r.id, type: r.type, title: r.title, body: r.body, readAt: r.read_at ?? undefined, createdAt: r.created_at }));
  }

  async listGoals(): Promise<Goal[]> {
    const { data, error } = await this.sb.from("goals").select("*").eq("active", true).order("target");
    if (error) throw error;
    return (data ?? []).map((g: Row) => ({ id: g.id, name: g.name, counterKey: g.counter_key, target: g.target, reward: g.reward }));
  }

  async saveGoal(g: Omit<Goal, "id"> & { id?: string }) {
    const row = { name: g.name, counter_key: g.counterKey, target: g.target, reward: g.reward };
    const { error } = g.id
      ? await this.sb.from("goals").update(row).eq("id", g.id)
      : await this.sb.from("goals").insert(row);
    if (error) throw error;
  }

  async deleteGoal(id: string) { const { error } = await this.sb.from("goals").update({ active: false }).eq("id", id); if (error) throw error; }

  async redeemCode(code: string, deviceId?: string): Promise<RedeemResult> {
    const { data, error } = await this.sb.rpc("redeem_code", { p_code: code, p_device_id: deviceId ?? null });
    if (error) throw error;
    return data as RedeemResult;
  }

  async myStatus(): Promise<StudentStatus> {
    const { data, error } = await this.sb.rpc("my_status");
    if (error) throw error;
    const d = data as Row;
    return {
      counters: d.counters ?? {},
      goals: (d.goals ?? []).map((g: Row) => ({ id: g.id, name: g.name, counterKey: g.counter_key, target: g.target, reward: g.reward })),
      rewards: (d.rewards ?? []).map((r: Row) => ({ id: r.id, reward: r.reward, unlockedAt: r.unlocked_at, redeemedAt: r.redeemed_at ?? undefined })),
    };
  }

  async redeemReward(id: string) { const { error } = await this.sb.rpc("redeem_reward", { p_reward_id: id }); if (error) throw error; }
}
