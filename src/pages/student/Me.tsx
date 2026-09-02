import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Coffee, CreditCard, Gift, PartyPopper, QrCode, Star, Ticket, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DAILY_CODES_LIMIT, levelName, useStudent } from "@/lib/student";
import { STAMPS_KEY, isRewardExpired, productStampsKey, type Transaction, type UnlockedReward } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/utils";
import { Badge, Button, buttonVariants, Card, CardContent, CardHeader, CardTitle, Modal, Progress } from "@/components/ui";

const HERO_IMG =
  "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=70";

export default function Me() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { status, codesToday, reload } = useStudent();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    await reload();
    setTxs(await api.listTransactions().catch(() => []));
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = !!status?.rewards.some((r) => r.requestedAt && !r.redeemedAt);
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void reload(), 5000);
    return () => clearInterval(id);
  }, [waiting, reload]);

  useEffect(() => {
    if (!status) return;
    const pendingIds = status.rewards.filter((r) => !r.redeemedAt && !isRewardExpired(r)).map((r) => r.id).join(",");
    if (pendingIds && sessionStorage.getItem("fidelty-reward-popup") !== pendingIds) {
      sessionStorage.setItem("fidelty-reward-popup", pendingIds);
      setPopup(true);
    }
  }, [status]);

  if (!status) return <p className="text-muted-foreground">{t("loading")}</p>;

  const points = status.counters.points ?? 0;
  const pending = status.rewards.filter((r) => !r.redeemedAt && !isRewardExpired(r));
  const expiredRewards = status.rewards.filter((r) => isRewardExpired(r));
  const { settings } = status;
  const showPoints = settings.showPointsCard;
  const pointGoals = status.goals.filter((g) => g.counterKey === "points").sort((a, b) => a.target - b.target);
  const goal = pointGoals[0] ?? { target: 300, reward: t("defReward") };
  const nextGoal = goal;
  const cycles = Math.floor(points / goal.target);
  const cyclePoints = points % goal.target;
  const missing = goal.target - cyclePoints;
  const level = user?.level ?? 1;

  const cardDefs = [
    ...status.products.map((p) => ({ key: p.id, title: p.name, target: Math.max(1, p.stampTarget), reward: p.reward, counterKey: productStampsKey(p.id), match: (r: UnlockedReward) => r.productId === p.id })),
    ...(status.products.length === 0 || (status.counters[STAMPS_KEY] ?? 0) > 0
      ? [{ key: "general", title: t("stampTitle"), target: Math.max(1, settings.stampTarget), reward: settings.stampReward || t("defReward"), counterKey: STAMPS_KEY, match: (r: UnlockedReward) => !r.productId }]
      : []),
  ];
  const cards = cardDefs.map((c) => {
    const total = status.counters[c.counterKey] ?? 0;
    const cardPending = pending.filter(c.match);
    const full = cardPending.length > 0 && total % c.target === 0 && total > 0;
    return { ...c, total, cycles: Math.floor(total / c.target), stamped: full ? c.target : total % c.target, cols: c.target <= 6 ? c.target : 5, pending: cardPending };
  });
  const first = cards[0];
  const STAMPS = first?.target ?? 1;
  const stamped = first?.stamped ?? 0;

  const panel = "rounded-3xl bg-white border border-[#eee3d8] p-6 shadow-sm space-y-4";
  const pill = "inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1 text-xs font-bold";

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

      <section className="relative overflow-hidden rounded-3xl shadow-xl text-white">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-[#4a2c17]/70" />
        <div className="relative p-7 md:p-9 space-y-4">
          <div className="text-xs font-black tracking-[0.3em] text-amber-200">{t("meMyBalance")}</div>
          <h1 className="text-2xl font-bold">{t("meHello", { n: user?.name.split(" ")[0] ?? "" })}</h1>
          <div className="flex items-end gap-3">
            <span className="text-7xl font-black leading-none">{fmtInt(showPoints ? points : stamped)}</span>
            <span className="text-2xl font-black text-amber-100 pb-2">{showPoints ? t("ptsUnit") : `/ ${STAMPS}`}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={pill}><Star className="h-3.5 w-3.5" /> {t("lvlLabel", { l: levelName(level) })}</span>
            <span className={pill}><Ticket className="h-3.5 w-3.5" /> {t("meCodesToday", { n: codesToday, m: DAILY_CODES_LIMIT })}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <Link to="/redeem" className={buttonVariants({ size: "lg", className: "font-bold px-8" })}><Ticket className="h-5 w-5 mr-2" /> {t("meEnterOne")}</Link>
            <Link to="/card" className={buttonVariants({ size: "lg", variant: "secondary", className: "font-bold" })}><QrCode className="h-5 w-5" /></Link>
          </div>
        </div>
      </section>

      {cards.map((c) => (
      <section key={c.key} className={panel}>
        <div className="flex items-center gap-2 font-black"><CreditCard className="h-4 w-4 text-primary" /> {c.title}</div>
        <div className="rounded-2xl bg-gradient-to-br from-[#f97316] to-[#c2410c] p-5 text-white shadow-inner space-y-4">
          <div className="flex justify-between items-center">
            <div className="font-black tracking-wide">{t("appName")}</div>
            <div className="text-sm font-semibold">{user?.name}</div>
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${c.cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: c.target }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-xl grid place-items-center border-2 transition ${i < c.stamped ? "bg-white text-primary border-white shadow" : "border-dashed border-white/50 text-white/40"}`}>
                {i < c.stamped ? <Check className="h-6 w-6 stroke-[3]" /> : <Coffee className="h-5 w-5" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs font-semibold opacity-90">
            <span>{c.stamped} / {c.target}</span>
            <span>🎁 {c.reward}</span>
          </div>
        </div>
        <div className="text-sm text-[#7a6a5c] font-semibold">
          {t("stampHint", { n: c.target - c.stamped, r: c.reward })}
          {c.cycles > 0 && <span className="text-[#9a8a7c] font-normal"> · {t("stampCycle", { n: c.cycles })}</span>}
        </div>
        {c.pending.map((r) => (
          <div key={r.id} className="rounded-2xl border-2 border-primary bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 font-black text-primary"><Gift className="h-5 w-5" /> {t("rwEntitled")}</div>
            <div className="text-2xl font-black">🎁 {r.reward}</div>
            {r.expiresAt && <div className="text-sm font-bold text-red-600">{t("rwUntil", { d: fmtDate(r.expiresAt) })}</div>}
            {r.requestedAt ? (
              <div className="rounded-xl bg-amber-100 text-amber-900 p-3 text-sm space-y-1">
                <div className="font-black animate-pulse">⏳ {t("rwWaiting")}</div>
                <div>{t("rwWaitingHint")}</div>
              </div>
            ) : (
              <>
                <p className="text-sm text-[#7a6a5c]">{t("rwShowCashier")}</p>
                <p className="text-sm font-bold text-red-600">{t("rwIrreversible")}</p>
                <Button size="lg" className="w-full font-bold" disabled={busy} onClick={async () => { setBusy(true); try { await api.redeemReward(r.id); } catch { /* già richiesto: ricarico lo stato */ } finally { await reload(); setBusy(false); } }}>{t("rdRedeem")}</Button>
              </>
            )}
          </div>
        ))}
      </section>
      ))}

      {showPoints && (
        <section className={panel}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black"><TrendingUp className="h-4 w-4 text-primary" /> {t("meNextReward")}</div>
            <div className="text-sm font-semibold text-[#7a6a5c]">{nextGoal.reward}</div>
          </div>
          <div className="text-3xl font-black">{fmtInt(cyclePoints)}<span className="text-[#b8a898]"> / {fmtInt(nextGoal.target)}</span></div>
          <Progress value={(100 * cyclePoints) / nextGoal.target} className="h-3 bg-[#fde8d3]" />
          <div className="text-sm font-semibold text-primary">
            {t("missing", { n: fmtInt(missing), u: t("unitPoints") })}{cycles > 0 && <span className="text-[#9a8a7c]"> · {t("stampCycle", { n: cycles })}</span>}
          </div>
        </section>
      )}

      <section className={panel}>
        <div className="flex items-center gap-2 font-black"><Coffee className="h-4 w-4 text-primary" /> {t("howTitle")}</div>
        <ol className="grid gap-3 md:grid-cols-2">
          {(["how1", "how2", "how3", "how4"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-2xl bg-[#fbf7f2] p-4">
              <div className="h-8 w-8 shrink-0 rounded-full bg-[#fde8d3] text-primary font-black grid place-items-center text-sm">{i + 1}</div>
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
                <div className="text-xs text-muted-foreground">{t("meUnlockedOn", { d: fmtDateTime(r.unlockedAt) })}{r.expiresAt && ` · ${t("rwUntil", { d: fmtDate(r.expiresAt) })}`}</div>
              </div>
              {r.requestedAt && <Badge variant="secondary">{t("rwRequestedOn", { d: fmtDateTime(r.requestedAt) })}</Badge>}
            </div>
          ))}
          {status.rewards.filter((r) => r.redeemedAt).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border p-3 opacity-70">
              <div className="text-sm">{r.reward}</div>
              <Badge variant="secondary">{t("meRedeemedOn", { d: fmtDateTime(r.redeemedAt) })}</Badge>
            </div>
          ))}
          {expiredRewards.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border p-3 opacity-60">
              <div className="text-sm line-through">{r.reward}</div>
              <Badge variant="destructive">{t("rwExpiredOn", { d: fmtDate(r.expiresAt) })}</Badge>
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
