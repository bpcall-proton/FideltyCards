import { useEffect, useState, type FormEvent } from "react";
import { Printer as PrinterIcon, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { eposUrl, printCode } from "@/lib/print";
import type { Printer, PrinterSettings, PrinterType } from "@/lib/types";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";

export default function Printers() {
  const { t } = useI18n();
  const [s, setS] = useState<PrinterSettings>({ printers: [] });
  const [name, setName] = useState("Epson TM-m30III");
  const [type, setType] = useState<PrinterType>("epos");
  const [host, setHost] = useState("");
  const [deviceId, setDeviceId] = useState("local_printer");
  const [secure, setSecure] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void api.getPrinters().then(setS); }, []);

  async function persist(next: PrinterSettings) {
    setS(next);
    await api.savePrinters(next);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || (type === "epos" && !host.trim())) return;
    const p: Printer = { id: crypto.randomUUID(), name: name.trim(), type, host: type === "epos" ? host.trim() : undefined, deviceId: type === "epos" ? deviceId.trim() || "local_printer" : undefined, secure };
    await persist({ printers: [...s.printers, p], defaultId: s.defaultId ?? p.id });
    setHost("");
  }

  async function test(p: Printer) {
    setMsg(t("prPrinting"));
    try {
      await printCode(p, { code: "12345678", lotId: "", lotName: "TEST", productName: t("prTestTicket"), reward: null, stampTarget: null }, t("appName"));
      setMsg(t("prTestOk"));
    } catch (err) {
      setMsg(t("prPrintError", { e: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("prsTitle")}</CardTitle>
          <CardDescription>{t("prsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <Field label={t("prName")}><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label={t("prType")}>
              <Select value={type} onChange={(e) => setType(e.target.value as PrinterType)}>
                <option value="epos">{t("prEpos")}</option>
                <option value="browser">{t("prBrowser")}</option>
              </Select>
            </Field>
            {type === "epos" && (
              <>
                <Field label={t("prHost")} hint={t("prHostHint")}><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" required /></Field>
                <Field label={t("prDevice")}><Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} /></Field>
                <label className="col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
                  {t("prSecure")}
                </label>
                <p className="col-span-2 text-xs text-muted-foreground">{t("prEposHelp")}</p>
              </>
            )}
            <Button type="submit" className="col-span-2">{t("prAdd")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 divide-y">
          {s.printers.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2"><PrinterIcon className="h-4 w-4" /> {p.name} {s.defaultId === p.id && <Badge>{t("prDefault")}</Badge>}</div>
                <div className="text-muted-foreground truncate">{p.type === "epos" ? eposUrl(p) : t("prBrowser")}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => test(p)}>{t("prTest")}</Button>
                <Button size="sm" variant="ghost" title={t("prSetDefault")} onClick={() => persist({ ...s, defaultId: p.id })}><Star className={`h-4 w-4 ${s.defaultId === p.id ? "fill-current text-primary" : ""}`} /></Button>
                <Button size="sm" variant="ghost" onClick={() => persist({ printers: s.printers.filter((x) => x.id !== p.id), defaultId: s.defaultId === p.id ? undefined : s.defaultId })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
          {s.printers.length === 0 && <p className="text-sm text-muted-foreground py-2">{t("prEmpty")}</p>}
          {msg && <p className="text-sm pt-3">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
