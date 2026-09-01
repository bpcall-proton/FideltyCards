import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { exportExcel, exportPdfQr, exportPdfTable } from "@/lib/export";
import { describeValue, type CodeFormat, type GenerateLotInput, type Lot, type ValueType, VALUE_TYPE_LABELS } from "@/lib/types";
import { fmtInt } from "@/lib/utils";
import { Button, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";

const PRESET_QTY = [1000, 5000, 10000, 50000];
const PRESET_POINTS = [5, 10, 20, 50, 100];
const PRESET_QTY_VALUE = [1, 2, 5];

export default function Generate() {
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<ValueType>("points");
  const [valueAmount, setValueAmount] = useState(10);
  const [productKey, setProductKey] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [quantity, setQuantity] = useState(5000);
  const [customQty, setCustomQty] = useState(false);
  const [alnum, setAlnum] = useState(false);
  const [withNumeric, setWithNumeric] = useState(true);
  const [withQr, setWithQr] = useState(true);
  const [codeLength, setCodeLength] = useState(6);
  const [expiryMode, setExpiryMode] = useState<"none" | "date" | "range">("none");
  const [validFrom, setValidFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showLimits, setShowLimits] = useState(false);
  const [maxPerDay, setMaxPerDay] = useState("");
  const [maxPointsDay, setMaxPointsDay] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Lot | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const isQtyType = valueType === "quantity" || valueType === "product";
  const presets = isQtyType ? PRESET_QTY_VALUE : PRESET_POINTS;

  const codeFormat: CodeFormat = alnum && !withQr ? "alphanumeric" : withQr && !withNumeric ? "qr" : withQr ? "numeric_qr" : "numeric";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Inserisci il nome del lotto.");
    if (!withNumeric && !withQr) return setError("Scegli almeno un formato.");
    if (isQtyType && !productKey.trim()) return setError("Indica il prodotto (es. CAFFÈ).");
    if (quantity < 1) return setError("Quantità non valida.");
    const input: GenerateLotInput = {
      name: name.trim(),
      valueType,
      valueAmount: valueType === "promotion" ? 1 : valueAmount,
      quantity,
      codeFormat: alnum && withQr ? "alphanumeric" : codeFormat,
      codeLength,
      productKey: isQtyType ? productKey.trim() : undefined,
      promotionId: valueType === "promotion" && promotionId.trim() ? promotionId.trim() : undefined,
      validFrom: expiryMode === "range" && validFrom ? new Date(validFrom).toISOString() : undefined,
      expiresAt: expiryMode !== "none" && expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : undefined,
      maxCodesPerStudentPerDay: maxPerDay ? Number(maxPerDay) : undefined,
      maxPointsPerStudentPerDay: maxPointsDay ? Number(maxPointsDay) : undefined,
      maxTotalUses: maxTotal ? Number(maxTotal) : undefined,
      minLevel: minLevel ? Number(minLevel) : undefined,
    };
    setBusy(true);
    try {
      setResult(await api.generateLot(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function dl(kind: "pdf" | "excel") {
    if (!result) return;
    setProgress("Preparazione file…");
    try {
      const codes = await api.listCodes(result.id);
      if (kind === "excel") exportExcel(result, codes);
      else if (result.codeFormat === "qr" || result.codeFormat === "numeric_qr" || (alnum && withQr))
        await exportPdfQr(result, codes, (d, t) => setProgress(`QR ${fmtInt(d)} / ${fmtInt(t)}`));
      else exportPdfTable(result, codes);
    } finally {
      setProgress(null);
    }
  }

  if (result) {
    return (
      <Card className="max-w-xl mx-auto text-center">
        <CardContent className="pt-8 space-y-4">
          <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
          <h2 className="text-2xl font-bold">{fmtInt(result.totalCodes)} CODICI GENERATI</h2>
          <p className="text-muted-foreground">
            Lotto <b>#{result.lotNumber}</b> · {result.name} · {describeValue(result)}
          </p>
          {progress && <p className="text-sm text-primary">{progress}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <Button onClick={() => dl("pdf")} disabled={!!progress}><Download className="h-4 w-4" /> Scarica PDF</Button>
            <Button variant="secondary" onClick={() => dl("excel")} disabled={!!progress}><FileSpreadsheet className="h-4 w-4" /> Scarica Excel</Button>
            <Link to={`/admin/lots/${result.id}`} className={buttonVariants({ variant: "outline" })}>Visualizza lotto</Link>
          </div>
          <Button variant="ghost" onClick={() => setResult(null)}>Genera un altro lotto</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>GENERA NUOVI CODICI</CardTitle>
          <CardDescription>I codici sono casuali e non prevedibili; il loro valore è deciso solo dal server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Nome lotto">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PROMO CAFFÈ" required />
          </Field>

          <Field label="Tipo">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(VALUE_TYPE_LABELS) as ValueType[]).map((t) => (
                <label key={t} className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${valueType === t ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="vt" checked={valueType === t} onChange={() => { setValueType(t); setValueAmount(t === "quantity" || t === "product" ? 1 : 10); }} />
                  {VALUE_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
          </Field>

          {isQtyType && (
            <Field label="Prodotto" hint="Es. CAFFÈ, COLAZIONE. Il contatore dello studente aumenta per questo prodotto.">
              <Input value={productKey} onChange={(e) => setProductKey(e.target.value)} placeholder="CAFFÈ" />
            </Field>
          )}
          {valueType === "promotion" && (
            <Field label="ID promozione (opzionale)" hint="Permette di disattivare tutti i lotti di una promozione insieme.">
              <Input value={promotionId} onChange={(e) => setPromotionId(e.target.value)} placeholder="uuid promozione" />
            </Field>
          )}

          {valueType !== "promotion" && (
            <Field label={isQtyType ? "Valore (quantità)" : "Valore (punti)"}>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button key={p} type="button" size="sm" variant={valueAmount === p ? "default" : "outline"} onClick={() => setValueAmount(p)}>
                    +{p}
                  </Button>
                ))}
                <Input type="number" min={1} className="w-28" value={valueAmount} onChange={(e) => setValueAmount(Number(e.target.value))} />
              </div>
            </Field>
          )}

          <Field label="Quantità codici">
            <div className="flex flex-wrap gap-2">
              {PRESET_QTY.map((q) => (
                <Button key={q} type="button" size="sm" variant={!customQty && quantity === q ? "default" : "outline"} onClick={() => { setCustomQty(false); setQuantity(q); }}>
                  {fmtInt(q)}
                </Button>
              ))}
              <Button type="button" size="sm" variant={customQty ? "default" : "outline"} onClick={() => setCustomQty(true)}>Personalizzata</Button>
              {customQty && <Input type="number" min={1} max={500000} className="w-32" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />}
            </div>
          </Field>

          <Field label="Scadenza">
            <div className="flex flex-wrap gap-3 text-sm">
              {([["none", "Nessuna"], ["date", "Data di scadenza"], ["range", "Periodo di validità"]] as const).map(([m, l]) => (
                <label key={m} className="flex items-center gap-1.5"><input type="radio" checked={expiryMode === m} onChange={() => setExpiryMode(m)} /> {l}</label>
              ))}
            </div>
            {expiryMode !== "none" && (
              <div className="flex gap-2 pt-2">
                {expiryMode === "range" && <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />}
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
              </div>
            )}
          </Field>

          <Field label="Formato">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withNumeric} onChange={(e) => setWithNumeric(e.target.checked)} /> Codice numerico</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withQr} onChange={(e) => setWithQr(e.target.checked)} /> QR Code</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={alnum} onChange={(e) => setAlnum(e.target.checked)} /> Alfanumerico</label>
              <label className="flex items-center gap-1.5">Lunghezza
                <Select className="h-8 w-20" value={codeLength} onChange={(e) => setCodeLength(Number(e.target.value))}>
                  {[6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </label>
            </div>
          </Field>

          <button type="button" className="text-sm text-primary underline" onClick={() => setShowLimits(!showLimits)}>
            {showLimits ? "Nascondi limiti" : "Limiti avanzati (opzionali)"}
          </button>
          {showLimits && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max codici/giorno per studente"><Input type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} /></Field>
              <Field label="Max punti/giorno per studente"><Input type="number" min={1} value={maxPointsDay} onChange={(e) => setMaxPointsDay(e.target.value)} /></Field>
              <Field label="Max utilizzi totali lotto"><Input type="number" min={1} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} /></Field>
              <Field label="Livello minimo studente"><Input type="number" min={1} value={minLevel} onChange={(e) => setMinLevel(e.target.value)} /></Field>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generazione di {fmtInt(quantity)} codici…</> : "GENERA CODICI"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
