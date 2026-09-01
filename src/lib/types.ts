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
}

export interface StudentStatus {
  counters: Record<string, number>;
  goals: Goal[];
  rewards: UnlockedReward[];
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
  listGoals(): Promise<Goal[]>;
  saveGoal(goal: Omit<Goal, "id"> & { id?: string }): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  redeemCode(code: string, deviceId?: string): Promise<RedeemResult>;
  myStatus(): Promise<StudentStatus>;
  redeemReward(id: string): Promise<void>;
}

export const REDEEM_ERROR_MESSAGES: Record<RedeemError, string> = {
  NOT_AUTHENTICATED: "Devi effettuare l'accesso.",
  NOT_FOUND: "CODICE NON VALIDO",
  ALREADY_USED: "CODICE GIÀ UTILIZZATO",
  CANCELLED: "CODICE DISATTIVATO",
  EXPIRED: "CODICE SCADUTO",
  NOT_YET_VALID: "CODICE NON ANCORA VALIDO",
  LEVEL_TOO_LOW: "CODICE NON DISPONIBILE PER IL TUO LIVELLO",
  PROMOTION_EXHAUSTED: "PROMOZIONE ESAURITA",
  DAILY_LIMIT: "LIMITE GIORNALIERO DI CODICI RAGGIUNTO",
  DAILY_POINTS_LIMIT: "LIMITE GIORNALIERO DI PUNTI RAGGIUNTO",
};

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  points: "Punti",
  quantity: "Quantità prodotto",
  bonus: "Bonus",
  product: "Prodotto",
  promotion: "Promozione",
};

export const CODE_FORMAT_LABELS: Record<CodeFormat, string> = {
  numeric: "Solo numerico",
  alphanumeric: "Alfanumerico",
  qr: "QR Code",
  numeric_qr: "Numerico + QR",
};

export function describeValue(l: { valueType: ValueType; valueAmount: number; productKey?: string; name: string }): string {
  switch (l.valueType) {
    case "points":
      return `+${l.valueAmount} punti`;
    case "bonus":
      return `+${l.valueAmount} punti bonus`;
    case "quantity":
      return `+${l.valueAmount} ${l.productKey ?? l.name} consumat${l.valueAmount === 1 ? "o" : "i"}`;
    case "product":
      return `${l.valueAmount} ${l.productKey ?? l.name}`;
    case "promotion":
      return `Partecipazione: ${l.name}`;
  }
}
