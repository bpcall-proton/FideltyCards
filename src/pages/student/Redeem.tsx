import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Loader2, PartyPopper, Star, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { codeFromQrPayload, normalizeCode } from "@/lib/codegen";
import { REDEEM_ERROR_MESSAGES, type RedeemResult } from "@/lib/types";
import { deviceId, fmtInt } from "@/lib/utils";
import { Button, Card, CardContent, Input, Modal, Progress } from "@/components/ui";
import QrScanner from "@/components/QrScanner";

export default function Redeem() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [showReward, setShowReward] = useState(false);

  const submit = useCallback(async (raw: string) => {
    const c = normalizeCode(raw);
    if (!c) return;
    setBusy(true);
    setResult(null);
    try {
      // il client invia solo il codice: il valore lo decide il backend
      const r = await api.redeemCode(c, deviceId());
      setResult(r);
      if (r.ok && r.unlocked.length > 0) setShowReward(true);
      if (r.ok) setCode("");
    } catch (e) {
      setResult({ ok: false, error: "NOT_FOUND" });
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const fromQr = params.get("code");
    if (fromQr) {
      setParams({}, { replace: true });
      void submit(fromQr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScan = useCallback((text: string) => {
    setScanning(false);
    const c = codeFromQrPayload(text);
    setCode(c);
    void submit(c);
  }, [submit]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(code);
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h1 className="text-2xl font-bold text-center">🎟️ INSERISCI IL TUO CODICE</h1>
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="482917"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              className="h-16 text-center text-3xl font-mono tracking-[0.3em]"
              maxLength={32}
              disabled={busy}
            />
            <Button type="submit" size="xl" className="w-full" disabled={busy || code.trim().length < 4}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "CONFERMA"}
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground">oppure</div>
          <Button type="button" size="xl" variant="secondary" className="w-full" onClick={() => { setScanError(null); setScanning(true); }}>
            <Camera className="h-5 w-5" /> SCANSIONA QR
          </Button>
          {scanning && (
            <div className="space-y-2">
              <QrScanner onScan={onScan} onError={(m) => { setScanError(m); setScanning(false); }} />
              <Button variant="ghost" className="w-full" onClick={() => setScanning(false)}>Annulla</Button>
            </div>
          )}
          {scanError && <p className="text-sm text-destructive text-center">{scanError}</p>}
        </CardContent>
      </Card>

      {result && result.ok === false && (
        <Card className="border-destructive bg-destructive/5 animate-slide-in">
          <CardContent className="pt-5 flex items-center gap-3 text-destructive font-bold">
            <XCircle className="h-8 w-8 shrink-0" /> ❌ {REDEEM_ERROR_MESSAGES[result.error]}
          </CardContent>
        </Card>
      )}

      {result && result.ok === true && (
        <Card className="border-emerald-500 bg-emerald-50 animate-slide-in">
          <CardContent className="pt-5 space-y-3 text-center">
            <div className="text-xl font-bold text-emerald-700">🎉 CODICE ACCETTATO!</div>
            <div className="text-sm text-muted-foreground">Hai ricevuto:</div>
            <div className="text-3xl font-black flex items-center justify-center gap-2">
              <Star className="h-7 w-7 text-amber-500 fill-amber-400" />
              {result.points > 0 ? `+${result.points} PUNTI` : `+${result.quantity} ${labelFor(result.counter_key, result.lot_name)}`}
            </div>
            <div className="text-sm">
              Nuovo saldo: <b>{fmtInt(result.new_balance)} {result.counter_key === "points" ? "PUNTI" : labelFor(result.counter_key, result.lot_name)}</b>
            </div>
            {result.next_goal && (
              <GoalProgress value={result.new_balance} target={result.next_goal.target} reward={result.next_goal.reward} unit={result.counter_key === "points" ? "punti" : labelFor(result.counter_key, result.lot_name).toLowerCase()} />
            )}
            <div className="text-xs text-muted-foreground font-mono">Transazione #{result.transaction_id}</div>
          </CardContent>
        </Card>
      )}

      <Modal open={showReward} onClose={() => setShowReward(false)}>
        {result?.ok && (
          <div className="text-center space-y-3">
            <PartyPopper className="h-14 w-14 text-primary mx-auto" />
            <h2 className="text-2xl font-black">🎉 CONGRATULAZIONI!</h2>
            <p>Hai raggiunto il tuo obiettivo!</p>
            {result.unlocked.map((u, i) => (
              <div key={i} className="rounded-lg bg-primary/10 p-4">
                <div className="text-sm text-muted-foreground">🎁 Hai sbloccato:</div>
                <div className="text-xl font-bold">{u.reward}</div>
              </div>
            ))}
            <Button size="lg" className="w-full" onClick={() => { setShowReward(false); nav("/me"); }}>RISCATTA</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function labelFor(counterKey: string, lotName: string) {
  if (counterKey === "points") return "PUNTI";
  if (counterKey.startsWith("promo:")) return lotName.toUpperCase();
  return counterKey.toUpperCase();
}

export function GoalProgress({ value, target, reward, unit }: { value: number; target: number; reward: string; unit: string }) {
  const within = value % target;
  const shown = within === 0 && value > 0 ? target : within;
  const missing = target - shown;
  return (
    <div className="space-y-1.5 text-left">
      <Progress value={(100 * shown) / target} />
      <div className="flex justify-between text-sm">
        <span>Progress: <b>{fmtInt(shown)} / {fmtInt(target)}</b></span>
        <span className="text-muted-foreground">🎁 {reward}</span>
      </div>
      {missing > 0 && missing < target && <div className="text-sm text-center text-primary font-medium">Ti mancano {fmtInt(missing)} {unit} al prossimo premio!</div>}
    </div>
  );
}
