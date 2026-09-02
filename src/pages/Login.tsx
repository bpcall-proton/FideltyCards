import { useState, type FormEvent } from "react";
import { Check, Coffee, Gift, Globe, KeyRound, QrCode, ShoppingBag, Sparkles, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";
import { LangSwitch } from "@/components/Layout";
import { useI18n } from "@/lib/i18n";

const STEPS = [
  { icon: ShoppingBag, t: "lpS1t", d: "lpS1d" },
  { icon: QrCode, t: "lpS2t", d: "lpS2d" },
  { icon: Check, t: "lpS3t", d: "lpS3d" },
  { icon: Gift, t: "lpS4t", d: "lpS4d" },
] as const;

const FEATURES = ["lpF1", "lpF2", "lpF3", "lpF4"] as const;

function DemoCard() {
  const stamped = 6;
  return (
    <div className="relative rounded-3xl p-5 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-[0_0_60px_-10px_rgba(251,146,60,.7)] ring-1 ring-white/30 rotate-[-3deg] hover:rotate-0 transition-transform duration-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-black tracking-widest text-sm"><Coffee className="h-5 w-5" /> CARD</div>
        <div className="font-black">{stamped} / 8</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`aspect-square rounded-xl grid place-items-center border-2 ${i < stamped ? "bg-white text-orange-600 border-white shadow" : "border-dashed border-white/50 text-white/40"}`}>
            {i < stamped ? <Check className="h-5 w-5 stroke-[3]" /> : <Coffee className="h-4 w-4" />}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-black/20 px-3 py-2 text-xs font-bold flex items-center gap-2"><Gift className="h-4 w-4" /> 🎁 Cafea gratis</div>
    </div>
  );
}

export default function Login() {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "in") await api.signIn(email, password);
      else await api.signUp(email, password, name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#070b18] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-orange-500/30 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-cyan-500/25 blur-[120px]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 font-black tracking-tight"><Ticket className="h-6 w-6 text-orange-400" /> {t("appName")}</div>
        <LangSwitch className="h-10 rounded-xl border-orange-400/50 bg-[#0c1226] text-white text-sm font-bold px-3 [&>option]:bg-[#0c1226] [&>option]:text-white" />
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-5 pb-16 grid gap-10 lg:grid-cols-2 lg:items-start">
        <section className="space-y-8 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-3 py-1 text-xs font-bold tracking-widest text-orange-300">
            <Sparkles className="h-3.5 w-3.5" /> {t("lpTag")}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] bg-gradient-to-r from-white via-orange-100 to-orange-400 bg-clip-text text-transparent">{t("lpHero")}</h1>
          <p className="text-white/70 text-lg max-w-prose">{t("lpSub")}</p>

          <div className="max-w-xs mx-auto lg:mx-0"><DemoCard /></div>

          <div>
            <div className="text-xs font-black tracking-widest text-cyan-300 mb-3">{t("lpHow")}</div>
            <ol className="grid sm:grid-cols-2 gap-3">
              {STEPS.map((s, i) => (
                <li key={s.t} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 hover:border-orange-400/50 transition">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-400 to-amber-600 grid place-items-center text-white shadow-lg shadow-orange-500/30"><s.icon className="h-5 w-5" /></div>
                    <div className="font-black"><span className="text-white/40 mr-1">0{i + 1}</span>{t(s.t)}</div>
                  </div>
                  <p className="text-sm text-white/65">{t(s.d)}</p>
                </li>
              ))}
            </ol>
          </div>

          <ul className="grid sm:grid-cols-2 gap-2 text-sm text-white/75">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-cyan-400/20 text-cyan-300 grid place-items-center"><Check className="h-3 w-3 stroke-[3]" /></span>{t(f)}</li>
            ))}
          </ul>
        </section>

        <section className="lg:sticky lg:top-6">
          <div className="relative rounded-3xl p-[1px] bg-gradient-to-br from-orange-400/60 via-white/10 to-cyan-400/60 shadow-[0_0_80px_-20px_rgba(34,211,238,.5)]">
            <div className="rounded-3xl bg-[#0c1226]/90 backdrop-blur-xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3 mb-4 text-xs font-bold tracking-widest text-white/50">
                <span className="flex items-center gap-1"><Globe className="h-4 w-4" /> RO / IT / RU</span>
                <LangSwitch className="h-9 rounded-xl border-white/20 bg-white/10 text-white text-sm font-bold px-3 [&>option]:bg-[#0c1226] [&>option]:text-white" />
              </div>
              <div className="flex gap-1 rounded-2xl bg-white/5 p-1 mb-6">
                {(["in", "up"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${mode === m ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow" : "text-white/60 hover:text-white"}`}>
                    {m === "in" ? t("loginSignIn") : t("loginSignUp")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-5 text-white/80"><KeyRound className="h-5 w-5 text-cyan-300" /><span className="font-black text-xl">{mode === "in" ? t("loginSignIn") : t("loginSignUp")}</span></div>
              <form onSubmit={submit} className="space-y-4 [&_label]:text-white/70 [&_input]:bg-white/5 [&_input]:border-white/15 [&_input]:text-white [&_input]:placeholder:text-white/30 [&_input:focus-visible]:ring-orange-400">
                {mode === "up" && <Field label={t("loginFullName")}><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
                <Field label={t("loginEmail")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
                <Field label={t("loginPassword")}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" size="lg" className="w-full font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white border-0 shadow-lg shadow-orange-500/40" disabled={busy}>
                  {mode === "in" ? t("loginSignIn") : t("loginSignUp")}
                </Button>
                <button type="button" className="w-full text-sm text-white/60 hover:text-white hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
                  {mode === "in" ? t("loginNoAccount") : t("loginHaveAccount")}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
