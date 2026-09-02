import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Printer as PrinterIcon, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { printCode } from "@/lib/print";
import type { IssuedCode, Printer, PrinterSettings, Product } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";

export default function Products() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(8);
  const [reward, setReward] = useState("");
  const [printers, setPrinters] = useState<PrinterSettings>({ printers: [] });
  const [printerId, setPrinterId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<IssuedCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [p, pr] = await Promise.all([api.listProducts(), api.getPrinters()]);
    setItems(p.filter((x) => x.active));
    setPrinters(pr);
    setPrinterId((cur) => cur || pr.defaultId || pr.printers[0]?.id || "browser");
  };
  useEffect(() => { void load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !reward.trim() || target < 1) return;
    await api.saveProduct({ name: name.trim(), stampTarget: Math.round(target), reward: reward.trim(), active: true });
    setName(""); setReward("");
    await load();
  }

  const printer = (): Printer | undefined => printers.printers.find((p) => p.id === printerId);

  async function print(p: Product) {
    setBusy(p.id); setError(null);
    try {
      const c = await api.issueCode({ productId: p.id });
      setLast(c);
      await printCode(printer(), c, t("appName"));
    } catch (err) {
      setError(t("prPrintError", { e: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("pdTitle")}</CardTitle>
          <CardDescription>{t("pdSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <Field label={t("pdName")}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pdNamePh")} required /></Field>
            <Field label={t("stTarget")}><Input type="number" min={1} max={50} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
            <Field label={t("stReward")}><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder={t("goalRewardPh")} required /></Field>
            <Button type="submit" className="self-end">{t("pdAdd")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{t("pdList")}</span>
            <span className="flex items-center gap-2 text-sm font-normal">
              <PrinterIcon className="h-4 w-4" />
              <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)} className="h-8 w-44">
                {printers.printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="browser">{t("prBrowser")}</option>
              </Select>
              <Link to="/admin/printers" className="underline text-xs">{t("navPrinters")}</Link>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <div className="font-bold text-base">{p.name}</div>
                <div className="text-muted-foreground">{p.stampTarget} {t("pdBoxes")} → 🎁 {p.reward}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" className="font-bold" disabled={busy === p.id} onClick={() => print(p)}>
                  <PrinterIcon className="h-4 w-4 mr-1" /> {busy === p.id ? t("prPrinting") : t("pdPrintCode")}
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm(t("pdDeleteConfirm", { n: p.name }))) { await api.deleteProduct(p.id); await load(); } }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground py-2">{t("pdEmpty")}</p>}
          {error && <p className="text-sm text-destructive pt-3">{error}</p>}
          {last && !error && (
            <div className="pt-3 text-sm">
              {t("prLastPrinted")}: <span className="font-mono font-black text-lg">{last.code}</span> · {last.productName}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
