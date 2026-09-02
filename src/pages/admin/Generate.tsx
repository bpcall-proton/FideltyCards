import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { exportExcel, exportPdfQr, exportPdfTable } from "@/lib/export";
import { describeValue, type CodeFormat, type GenerateLotInput, type Lot, type Product, type ValueType, valueTypeLabel } from "@/lib/types";
import { fmtInt } from "@/lib/utils";
import { Button, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";

const PRESET_QTY = [1000, 5000, 10000, 50000];
const PRESET_POINTS = [5, 10, 20, 50, 100];
const PRESET_QTY_VALUE = [1, 2, 5];

export default function Generate() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<ValueType>("points");
  const [valueAmount, setValueAmount] = useState(10);
  const [productKey, setProductKey] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  useEffect(() => { void api.listProducts().then((p) => setProducts(p.filter((x) => x.active))).catch(() => setProducts([])); }, []);
  const [promotionId, setPromotionId] = useState("");
  const [quantity, setQuantity] = useState(5000);
  const [customQty, setCustomQty] = useState(false);
  const [alnum, setAlnum] = useState(false);
  const [withNumeric, setWithNumeric] = useState(true);
  const [withQr, setWithQr] = useState(true);
  const [codeLength, setCodeLength] = useState(8);
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
    if (!name.trim()) return setError(t("genErrName"));
    if (!withNumeric && !withQr) return setError(t("genErrFormat"));
    if (isQtyType && !productKey.trim()) return setError(t("genErrProduct"));
    if (quantity < 1) return setError(t("genErrQty"));
    const input: GenerateLotInput = {
      name: name.trim(),
      valueType,
      valueAmount: valueType === "promotion" ? 1 : valueAmount,
      quantity,
      codeFormat: alnum && withQr ? "alphanumeric" : codeFormat,
      codeLength,
      productKey: isQtyType ? productKey.trim() : undefined,
      productId: productId || undefined,
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
    setProgress(t("preparingFile"));
    try {
      const codes = await api.listCodes(result.id);
      if (kind === "excel") exportExcel(result, codes);
      else if (result.codeFormat === "qr" || result.codeFormat === "numeric_qr" || (alnum && withQr))
        await exportPdfQr(result, codes, (d, tot) => setProgress(`QR ${fmtInt(d)} / ${fmtInt(tot)}`));
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
          <h2 className="text-2xl font-bold">{t("genDone", { n: fmtInt(result.totalCodes) })}</h2>
          <p className="text-muted-foreground">
            {t("genLot")} <b>#{result.lotNumber}</b> · {result.name} · {describeValue(result)}
          </p>
          {progress && <p className="text-sm text-primary">{progress}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <Button onClick={() => dl("pdf")} disabled={!!progress}><Download className="h-4 w-4" /> {t("genDownloadPdf")}</Button>
            <Button variant="secondary" onClick={() => dl("excel")} disabled={!!progress}><FileSpreadsheet className="h-4 w-4" /> {t("genDownloadExcel")}</Button>
            <Link to={`/admin/lots/${result.id}`} className={buttonVariants({ variant: "outline" })}>{t("genViewLot")}</Link>
          </div>
          <Button variant="ghost" onClick={() => setResult(null)}>{t("genAnother")}</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("genTitle")}</CardTitle>
          <CardDescription>{t("genSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label={t("genLotName")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("genLotNamePh")} required />
          </Field>

          {products.length > 0 && (
            <Field label={t("pdLotFor")}>
              <Select value={productId} onChange={(e) => { const id = e.target.value; setProductId(id); const p = products.find((x) => x.id === id); if (p) { setValueType("product"); setValueAmount(1); setProductKey(p.name); } }}>
                <option value="">{t("pdLotNone")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stampTarget} → {p.reward})</option>)}
              </Select>
            </Field>
          )}

          <Field label={t("genType")}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(["points", "quantity", "bonus", "product", "promotion"] as ValueType[]).map((vt) => (
                <label key={vt} className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${valueType === vt ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="vt" checked={valueType === vt} onChange={() => { setValueType(vt); setValueAmount(vt === "quantity" || vt === "product" ? 1 : 10); }} />
                  {valueTypeLabel(vt)}
                </label>
              ))}
            </div>
          </Field>

          {isQtyType && (
            <Field label={t("genProduct")} hint={t("genProductHint")}>
              <Input value={productKey} onChange={(e) => setProductKey(e.target.value)} placeholder={t("genProductPh")} />
            </Field>
          )}
          {valueType === "promotion" && (
            <Field label={t("genPromoId")} hint={t("genPromoIdHint")}>
              <Input value={promotionId} onChange={(e) => setPromotionId(e.target.value)} placeholder={t("genPromoIdPh")} />
            </Field>
          )}

          {valueType !== "promotion" && (
            <Field label={isQtyType ? t("genValueQty") : t("genValuePts")}>
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

          <Field label={t("genQuantity")}>
            <div className="flex flex-wrap gap-2">
              {PRESET_QTY.map((q) => (
                <Button key={q} type="button" size="sm" variant={!customQty && quantity === q ? "default" : "outline"} onClick={() => { setCustomQty(false); setQuantity(q); }}>
                  {fmtInt(q)}
                </Button>
              ))}
              <Button type="button" size="sm" variant={customQty ? "default" : "outline"} onClick={() => setCustomQty(true)}>{t("genCustom")}</Button>
              {customQty && <Input type="number" min={1} max={500000} className="w-32" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />}
            </div>
          </Field>

          <Field label={t("genExpiry")}>
            <div className="flex flex-wrap gap-3 text-sm">
              {([["none", "genExpNone"], ["date", "genExpDate"], ["range", "genExpRange"]] as const).map(([m, l]) => (
                <label key={m} className="flex items-center gap-1.5"><input type="radio" checked={expiryMode === m} onChange={() => setExpiryMode(m)} /> {t(l)}</label>
              ))}
            </div>
            {expiryMode !== "none" && (
              <div className="flex gap-2 pt-2">
                {expiryMode === "range" && <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />}
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
              </div>
            )}
          </Field>

          <Field label={t("genFormat")}>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withNumeric} onChange={(e) => setWithNumeric(e.target.checked)} /> {t("genFmtNumeric")}</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withQr} onChange={(e) => setWithQr(e.target.checked)} /> {t("genFmtQr")}</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={alnum} onChange={(e) => setAlnum(e.target.checked)} /> {t("genFmtAlnum")}</label>
              <label className="flex items-center gap-1.5">{t("genLength")}
                <Select className="h-8 w-20" value={codeLength} onChange={(e) => setCodeLength(Number(e.target.value))}>
                  {[6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </label>
            </div>
          </Field>

          <button type="button" className="text-sm text-primary underline" onClick={() => setShowLimits(!showLimits)}>
            {showLimits ? t("genHideLimits") : t("genShowLimits")}
          </button>
          {showLimits && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("genMaxPerDay")}><Input type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} /></Field>
              <Field label={t("genMaxPtsDay")}><Input type="number" min={1} value={maxPointsDay} onChange={(e) => setMaxPointsDay(e.target.value)} /></Field>
              <Field label={t("genMaxTotal")}><Input type="number" min={1} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} /></Field>
              <Field label={t("genMinLevel")}><Input type="number" min={1} value={minLevel} onChange={(e) => setMinLevel(e.target.value)} /></Field>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("genGenerating", { n: fmtInt(quantity) })}</> : t("genSubmit")}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
