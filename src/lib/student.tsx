import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { t, type I18nKey } from "./i18n";
import type { StudentStatus } from "./types";

export const DAILY_CODES_LIMIT = 10;

export function levelKey(level: number): I18nKey {
  return level >= 3 ? "lvlGold" : level === 2 ? "lvlSilver" : "lvlBronze";
}
export const levelName = (level: number) => t(levelKey(level));

interface StudentCtx {
  status: StudentStatus | null;
  points: number;
  codesToday: number;
  reload: () => Promise<void>;
}

const Ctx = createContext<StudentCtx>({ status: null, points: 0, codesToday: 0, reload: async () => {} });

export function StudentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<StudentStatus | null>(null);
  const [codesToday, setCodesToday] = useState(0);

  const reload = useCallback(async () => {
    if (!user || user.role !== "student") { setStatus(null); return; }
    const [s, txs] = await Promise.all([
      api.myStatus().catch((e: unknown) => { console.error(e); return { counters: {}, goals: [], rewards: [] } as StudentStatus; }),
      api.listTransactions().catch((e: unknown) => { console.error(e); return []; }),
    ]);
    setStatus(s);
    const today = new Date().toDateString();
    setCodesToday(txs.filter((x) => new Date(x.createdAt).toDateString() === today).length);
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo(
    () => ({ status, points: status?.counters.points ?? 0, codesToday, reload }),
    [status, codesToday, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStudent = () => useContext(Ctx);
