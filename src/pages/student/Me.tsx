import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coffee, Gift, PartyPopper, QrCode, Star, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DAILY_CODES_LIMIT, levelName, useStudent } from "@/lib/student";
import type { Transaction } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtInt } from "@/lib/utils";
import { Badge, Button, buttonVariants, Card, CardContent, CardHeader, CardTitle, Modal, Progress } from "@/components/ui";

const HERO_IMG =
  "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=70";

export default function Me() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { status, codesToday, reload } = useStudent();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [popup, setPopup] = useState(false);

  const load = async () => {
    await reload();
    setTxs(await api.listTransactions());
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!status) return;
    const pendingIds = status.rewards.filter((r) => !r.redeemedAt).map((r) => r.id).join(",");
    if (pendingIds && sessionStorage.getItem("fidelty-reward-popup") !== pendingIds) {
      sessionStorage.setItem("fidelty-reward-popup", pendingIds);
      setPopup(true);
    }
  }, [status]);

  if (!status) return <p className="text-muted-foreground">{t("loading")}</p>;

  const points = status.counters.points ?? 0;
  const counters = Object.entries(status.counters).filter(([k]) => k !== "points" && !k.startsWith("promo:"));
  const pending = status.rewards.filter((r) => !r.redeemedAt);
  const goalsFor = (k: string) => status.goals.filter((g) => g.counterKey === k).sort((a, b) => a.target - b.target);
  const nextGoal = goalsFor("points").find((g) => g.target > points) ?? goalsFor("points").at(-1);
  const missing = nextGoal ? Math.max(0, nextGoal.target - points) : 0;
  const level = user?.level ?? 1;

  const section = "text-xs font-black tracking-[0.2em] text-primary";

  return (
    <div className="space-y-6">
      <Modal open={popup} onClose={() => setPopup(false)}>
        <div className="text-center space-y-3">
          <PartyPopper className="h-14 w-14 text-primary mx-auto" />
          <h2 className="text-xl font-black">{t("rwTitle")}</h2>
          {pending.map((r) => <div key={r.id} className="rounded-lg bg-primary/10 p-3 text-lg font-bold">🎁 {r.reward}</div>)}
          <p className="text-sm text-muted-foreground">{t("rwBody")}</p>
          <Button variant="outline" className="w-full" onClick={() => setPopup(false)}>{t("rwLater")}</Button>
        </div>
      </Modal>

      <div className="flex items-end justify-between">
        <div>
          <div className={section}>{t("meMyBalance")}</div>
          <h1 className="text-2xl font-black">{t("meHello", { n: user?.name.split(" ")[0] ?? "" })}</h1>
        </div>
        <div className="text-xs font-semibold text-[#9a8a7c]">{t("meCodesToday", { n: codesToday, m: DAILY_CODES_LIMIT })}</div>
      </div>

      <section className="relative overflow-hidden rounded-3xl shadow-xl min-h-[300px] text-white">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1d120a]/95 via-[#1d120a]/50 to-[#1d120a]/20" />
        <div className="relative p-6 md:p-8 flex flex-col justify-between min-h-[300px]">
          <div className="flex justify-between items-start">
            <Badge className="bg-white/15 text-white border-0 backdrop-blur">{t("lvlLabel", { l: levelName(level) })}</Badge>
            <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-6xl md:text-7xl font-black leading-none">{fmtInt(points)}</div>
              <div className="text-sm font-bold tracking-[0.25em] opacity-90">{t("ptsUnit")}</div>
            </div>
            {nextGoal && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold opacity-90">
                  <span>{t("meNextReward")}: {nextGoal.reward}</span>
                  <span>{fmtInt(Math.min(points, nextGoal.target))} / {fmtInt(nextGoal.target)}</span>
                </div>
                <Progress value={Math.min(100, (100 * points) / nextGoal.target)} className="h-2.5 bg-white/25" />
                {missing > 0 && <div className="text-xs opacity-90">{t("missing", { n: fmtInt(missing), u: t("unitPoints") })}</div>}
              </div>
            )}
            <div className="flex gap-2">
              <Link to="/redeem" className={buttonVariants({ size: "lg", className: "flex-1 font-bold" })}><Ticket className="h-5 w-5 mr-2" /> {t("meEnterOne")}</Link>
              <Link to="/card" className={buttonVariants({ size: "lg", variant: "secondary", className: "font-bold" })}><QrCode className="h-5 w-5" /></Link>
            </div>
          </div>
        </div>
      </section>

      {counters.map(([k, v]) => {
        const g = goalsFor(k)[0];
        const inCycle = g ? (v % g.target === 0 && v > 0 ? g.target : v % g.target) : v;
        const cells = g ? g.target : Math.max(v, 1);
        return (
          <section key={k} className="rounded-3xl bg-white border border-[#eee3d8] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={section}>{t("meConsumed", { p: k.toUpperCase() })}</div>
                <div className="text-3xl font-black">{fmtInt(inCycle)}{g && <span className="text-[#9a8a7c] text-xl"> / {g.target}</span>}</div>
              </div>
              {g && <div className="text-right text-sm font-semibold text-[#7a6a5c]">🎁 {g.reward}</div>}
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cells, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: cells }).map((_, i) => (
                <div key={i} className={`aspect-square rounded-2xl grid place-items-center border-2 ${i < inCycle ? "bg-primary border-primary text-white shadow" : "border-dashed border-[#e3d5c6] text-[#d8c9b8]"}`}>
                  <Coffee className="h-6 w-6" />
                </div>
              ))}
            </div>
            {g && inCycle < g.target && (
              <div className="text-sm text-[#7a6a5c] font-semibold">{t("meStampMissing", { n: g.target - inCycle, p: k.toLowerCase(), r: g.reward })}</div>
            )}
          </section>
        );
      })}

      <section className="rounded-3xl bg-white border border-[#eee3d8] p-6 shadow-sm space-y-4">
        <div className={section}>{t("howTitle")}</div>
        <ol className="grid gap-3 md:grid-cols-2">
          {(["how1", "how2", "how3", "how4"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-2xl bg-[#fbf7f2] p-4">
              <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-white font-black grid place-items-center">{i + 1}</div>
              <p className="text-sm text-[#5b4b3e] leading-snug">{t(k)}</p>
            </li>
          ))}
        </ol>
      </section>

      <Card className="rounded-3xl border-[#eee3d8] shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> {t("meRewards")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {status.rewards.length === 0 && <p className="text-sm text-muted-foreground">{t("meNoRewards")}</p>}
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-primary bg-primary/5 p-3">
              <div>
                <div className="font-bold">🎁 {r.reward}</div>
                <div className="text-xs text-muted-foreground">{t("meUnlockedOn", { d: fmtDateTime(r.unlockedAt) })}</div>
              </div>
              <Button size="sm" onClick={async () => { await api.redeemReward(r.id); await load(); }}>{t("rdRedeem")}</Button>
            </div>
          ))}
          {status.rewards.filter((r) => r.redeemedAt).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border p-3 opacity-70">
              <div className="text-sm">{r.reward}</div>
              <Badge variant="secondary">{t("meRedeemedOn", { d: fmtDateTime(r.redeemedAt) })}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-[#eee3d8] shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("meHistory")}</CardTitle></CardHeader>
        <CardContent className="divide-y text-sm">
          {txs.length === 0 && <p className="text-muted-foreground">{t("meNoHistory")}</p>}
          {txs.slice(0, 50).map((x) => (
            <div key={x.id} className="flex justify-between py-2">
              <div>
                <div className="font-mono font-semibold">{x.codeValue}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(x.createdAt)} · #{x.id}</div>
              </div>
              <div className="font-bold text-emerald-700">{x.points ? t("valPoints", { n: x.points }) : `+${x.quantity} ${x.productKey ?? ""}`}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
