import { t, type I18nKey } from "./i18n";

export type ValueType = "points" | "quantity" | "bonus" | "product" | "promotion";
export type CodeFormat = "numeric" | "alphanumeric" | "qr" | "numeric_qr";
export type CodeStatus = "ACTIVE" | "USED" | "EXPIRED" | "CANCELLED";
export type LotStatus = "ACTIVE" | "CANCELLED";
export type Role = "student" | "admin";

export interface User {
  id: string;
  name: string;
  role: Role;
  level: number;
  email?: string;
}

export interface GenerateLotInput {
  name: string;
  valueType: ValueType;
  valueAmount: number;
  quantity: number;
  codeFormat: CodeFormat;
  codeLength: number;
  productKey?: string;
  promotionId?: string;
  validFrom?: string;
  expiresAt?: string;
  maxCodesPerStudentPerDay?: number;
  maxPointsPerStudentPerDay?: number;
  maxTotalUses?: number;
  minLevel?: number;
}

export interface Lot {
  id: string;
  lotNumber: string;
  name: string;
  valueType: ValueType;
  valueAmount: number;
  productKey?: string;
  promotionId?: string;
  codeFormat: CodeFormat;
  codeLength: number;
  totalCodes: number;
  validFrom?: string;
  expiresAt?: string;
  status: LotStatus;
  maxCodesPerStudentPerDay?: number;
  maxPointsPerStudentPerDay?: number;
  maxTotalUses?: number;
  minLevel?: number;
  createdAt: string;
  usedCount: number;
  availableCount: number;
  expiredCount: number;
  cancelledCount: number;
  usagePercent: number;
}

export interface Code {
  id: string;
  lotId: string;
  code: string;
  status: CodeStatus;
  usedBy?: string;
  usedAt?: string;
  transactionId?: number | string;
}

export interface Transaction {
  id: number | string;
  codeId: string;
  codeValue: string;
  studentId: string;
  studentName?: string;
  lotId: string;
  promotionId?: string;
  productKey?: string;
  valueType: ValueType;
  points: number;
  quantity: number;
  deviceId?: string;
  status: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  counterKey: string;
  target: number;
  reward: string;
}

export interface UnlockedReward {
  id: string;
  reward: string;
  unlockedAt: string;
  redeemedAt?: string;
  expiresAt?: string;
}

export interface Promotion {
  id: string;
  name: string;
  valueType: ValueType;
  valueAmount: number;
  productKey?: string;
  validFrom?: string;
  expiresAt?: string;
}

export const STAMPS_KEY = "stamps";

export interface AppSettings {
  stampTarget: number;
  stampReward: string;
  showPointsCard: boolean;
  /** giorni per ritirare il premio; 0 = nessuna scadenza */
  rewardExpiryDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = { stampTarget: 10, stampReward: "", showPointsCard: false, rewardExpiryDays: 0 };

export const isRewardExpired = (r: UnlockedReward, now = Date.now()) => !r.redeemedAt && !!r.expiresAt && new Date(r.expiresAt).getTime() <= now;

export interface StudentStatus {
  counters: Record<string, number>;
  goals: Goal[];
  rewards: UnlockedReward[];
  settings: AppSettings;
}

export type RedeemError =
  | "NOT_AUTHENTICATED"
  | "NOT_FOUND"
  | "ALREADY_USED"
  | "CANCELLED"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "LEVEL_TOO_LOW"
  | "PROMOTION_EXHAUSTED"
  | "DAILY_LIMIT"
  | "DAILY_POINTS_LIMIT";

export type RedeemResult =
  | { ok: false; error: RedeemError }
  | {
      ok: true;
      transaction_id: number | string;
      lot_name: string;
      value_type: ValueType;
      counter_key: string;
      points: number;
      quantity: number;
      new_balance: number;
      next_goal: { name: string; target: number; reward: string } | null;
      unlocked: { goal: string; reward: string; target: number }[];
    };

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

export interface LoyaltyApi {
  readonly mode: "firebase" | "demo";
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string, fullName: string): Promise<User>;
  signOut(): Promise<void>;
  updateName(fullName: string): Promise<User>;
  demoUsers?(): User[];
  switchDemoUser?(id: string): Promise<User>;

  generateLot(input: GenerateLotInput): Promise<Lot>;
  listLots(): Promise<Lot[]>;
  getLot(id: string): Promise<Lot | null>;
  listCodes(lotId: string): Promise<Code[]>;
  listTransactions(lotId?: string): Promise<Transaction[]>;
  cancelCode(code: string): Promise<void>;
  cancelLot(lotId: string): Promise<void>;
  cancelPromotion(promotionId: string): Promise<void>;
  listNotifications(): Promise<AdminNotification[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(s: AppSettings): Promise<void>;
  listGoals(): Promise<Goal[]>;
  saveGoal(goal: Omit<Goal, "id"> & { id?: string }): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  redeemCode(code: string, deviceId?: string): Promise<RedeemResult>;
  myStatus(): Promise<StudentStatus>;
  listPromotions(): Promise<Promotion[]>;
  redeemReward(id: string): Promise<void>;
}

const REDEEM_ERROR_KEYS: Record<RedeemError, I18nKey> = {
  NOT_AUTHENTICATED: "errNotAuthenticated",
  NOT_FOUND: "errNotFound",
  ALREADY_USED: "errAlreadyUsed",
  CANCELLED: "errCancelled",
  EXPIRED: "errExpired",
  NOT_YET_VALID: "errNotYetValid",
  LEVEL_TOO_LOW: "errLevelTooLow",
  PROMOTION_EXHAUSTED: "errPromotionExhausted",
  DAILY_LIMIT: "errDailyLimit",
  DAILY_POINTS_LIMIT: "errDailyPointsLimit",
};
export const redeemErrorMessage = (e: RedeemError) => t(REDEEM_ERROR_KEYS[e]);

const VALUE_TYPE_KEYS: Record<ValueType, I18nKey> = {
  points: "vtPoints",
  quantity: "vtQuantity",
  bonus: "vtBonus",
  product: "vtProduct",
  promotion: "vtPromotion",
};
export const valueTypeLabel = (v: ValueType) => t(VALUE_TYPE_KEYS[v]);

const CODE_FORMAT_KEYS: Record<CodeFormat, I18nKey> = {
  numeric: "cfNumeric",
  alphanumeric: "cfAlphanumeric",
  qr: "cfQr",
  numeric_qr: "cfNumericQr",
};
export const codeFormatLabel = (f: CodeFormat) => t(CODE_FORMAT_KEYS[f]);

const CODE_STATUS_KEYS: Record<CodeStatus, I18nKey> = {
  ACTIVE: "stActive",
  USED: "stUsed",
  EXPIRED: "stExpired",
  CANCELLED: "stCancelled",
};
export const codeStatusLabel = (s: CodeStatus) => t(CODE_STATUS_KEYS[s]);

export function describeValue(l: { valueType: ValueType; valueAmount: number; productKey?: string; name: string }): string {
  const p = l.productKey ?? l.name;
  switch (l.valueType) {
    case "points":
      return t("valPoints", { n: l.valueAmount });
    case "bonus":
      return t("valBonus", { n: l.valueAmount });
    case "quantity":
      return t("valQuantity", { n: l.valueAmount, p });
    case "product":
      return t("valProduct", { n: l.valueAmount, p });
    case "promotion":
      return t("valPromotion", { name: l.name });
  }
}
