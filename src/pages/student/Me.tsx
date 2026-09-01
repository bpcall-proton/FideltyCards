import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Star } from "lucide-react";
import { api } from "@/lib/api";
import type { StudentStatus, Transaction } from "@/lib/types";
import { fmtDateTime, fmtInt } from "@/lib/utils";
import { Badge, Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { GoalProgress } from "./Redeem";

export default function Me() {
  const [status, setStatus] = useState<StudentStatus | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);

  const load = async () => {
    const [s, t] = await Promise.all([api.myStatus(), api.listTransactions()]);
    setStatus(s); setTxs(t);
  };
  useEffect(() => { void load(); }, []);

  if (!status) return <p className="text-muted-foreground">Caricamento…</p>;

  const points = status.counters.points ?? 0;
  const counters = Object.entries(status.counters).filter(([k]) => k !== "points" && !k.startsWith("promo:"));
  const pending = status.rewards.filter((r) => !r.redeemedAt);
  const goalsFor = (k: string) => status.goals.filter((g) => g.counterKey === k).sort((a, b) => a.target - b.target);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card className="bg-sidebar text-sidebar-foreground">
        <CardContent className="pt-6 text-center space-y-2">
          <div className="text-sm opacity-80">I TUOI PUNTI</div>
          <div className="text-5xl font-black flex items-center justify-center gap-2"><Star className="h-9 w-9 text-amber-400 fill-amber-400" /> {fmtInt(points)}</div>
          {goalsFor("points")[0] && (
            <div className="text-left pt-2 [&_*]:text-sidebar-foreground">
              <GoalProgress value={points} target={goalsFor("points")[0].target} reward={goalsFor("points")[0].reward} unit="punti" />
            </div>
          )}
          <Link to="/redeem" className={buttonVariants({ size: "lg", className: "w-full mt-2" })}>INSERISCI CODICE</Link>
        </CardContent>
      </Card>

      {counters.map(([k, v]) => {
        const g = goalsFor(k)[0];
        return (
          <Card key={k}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{k} CONSUMATI</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-bold">{g ? `${fmtInt(v % g.target === 0 && v > 0 ? g.target : v % g.target)} / ${g.target}` : fmtInt(v)}</div>
              {g && <GoalProgress value={v} target={g.target} reward={g.reward} unit={k.toLowerCase()} />}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> I tuoi premi</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {status.rewards.length === 0 && <p className="text-sm text-muted-foreground">Nessun premio ancora. Continua a raccogliere codici!</p>}
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3">
              <div>
                <div className="font-bold">🎁 {r.reward}</div>
                <div className="text-xs text-muted-foreground">Sbloccato il {fmtDateTime(r.unlockedAt)}</div>
              </div>
              <Button size="sm" onClick={async () => { await api.redeemReward(r.id); await load(); }}>RISCATTA</Button>
            </div>
          ))}
          {status.rewards.filter((r) => r.redeemedAt).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 opacity-70">
              <div className="text-sm">{r.reward}</div>
              <Badge variant="secondary">Riscattato {fmtDateTime(r.redeemedAt)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Storico codici</CardTitle></CardHeader>
        <CardContent className="divide-y text-sm">
          {txs.length === 0 && <p className="text-muted-foreground">Nessun codice utilizzato.</p>}
          {txs.slice(0, 50).map((t) => (
            <div key={t.id} className="flex justify-between py-2">
              <div>
                <div className="font-mono font-semibold">{t.codeValue}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(t.createdAt)} · #{t.id}</div>
              </div>
              <div className="font-bold text-emerald-700">{t.points ? `+${t.points} punti` : `+${t.quantity} ${t.productKey ?? ""}`}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
