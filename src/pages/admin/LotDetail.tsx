import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Download, FileSpreadsheet, FileText, QrCode, Search } from "lucide-react";
import { api } from "@/lib/api";
import { exportCsv, exportExcel, exportPdfQr, exportPdfTable } from "@/lib/export";
import { CODE_FORMAT_LABELS, describeValue, type Code, type CodeStatus, type Lot, type Transaction } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Progress, Select } from "@/components/ui";

const STATUS_BADGE: Record<CodeStatus, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  ACTIVE: { label: "Disponibile", variant: "success" },
  USED: { label: "Utilizzato", variant: "secondary" },
  EXPIRED: { label: "Scaduto", variant: "warning" },
  CANCELLED: { label: "Annullato", variant: "destructive" },
};

export default function LotDetail() {
  const { id = "" } = useParams();
  const [lot, setLot] = useState<Lot | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<"" | CodeStatus>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<"codes" | "history">("codes");

  const load = useCallback(async () => {
    const [l, c, t] = await Promise.all([api.getLot(id), api.listCodes(id), api.listTransactions(id)]);
    setLot(l); setCodes(c); setTxs(t);
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toUpperCase();
    return codes.filter((c) => (!filter || c.status === filter) && (!s || c.code.includes(s)));
  }, [codes, filter, search]);
  const PAGE = 100;
  const pageItems = filtered.slice(page * PAGE, (page + 1) * PAGE);

  async function run(fn: () => Promise<void> | void) {
    setProgress("Preparazione file…");
    try { await fn(); } finally { setProgress(null); }
  }

  async function cancelLot() {
    if (!lot || !confirm(`Disattivare il lotto #${lot.lotNumber}? Tutti i codici non ancora usati diventeranno CANCELLED.`)) return;
    await api.cancelLot(lot.id);
    await load();
  }
  async function cancelCode(c: Code) {
    if (!confirm(`Disattivare il codice ${c.code}?`)) return;
    await api.cancelCode(c.code);
    await load();
  }
  async function cancelPromotion() {
    if (!lot?.promotionId || !confirm("Disattivare TUTTI i lotti di questa promozione?")) return;
    await api.cancelPromotion(lot.promotionId);
    await load();
  }

  if (!lot) return <p className="text-muted-foreground">Caricamento…</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/lots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Tutti i lotti</Link>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <div className="text-xs font-mono text-muted-foreground">LOTTO #{lot.lotNumber}</div>
            <CardTitle className="text-2xl">{lot.name}</CardTitle>
            <div className="text-primary font-medium mt-1">{describeValue(lot)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Formato: {CODE_FORMAT_LABELS[lot.codeFormat]} · Creato: {fmtDate(lot.createdAt)} · Validità: {lot.validFrom ? `${fmtDate(lot.validFrom)} → ` : ""}{lot.expiresAt ? fmtDate(lot.expiresAt) : "nessuna scadenza"}
              {lot.maxCodesPerStudentPerDay && ` · Max ${lot.maxCodesPerStudentPerDay} codici/giorno`}
              {lot.maxPointsPerStudentPerDay && ` · Max ${lot.maxPointsPerStudentPerDay} punti/giorno`}
              {lot.maxTotalUses && ` · Max ${fmtInt(lot.maxTotalUses)} utilizzi`}
              {lot.minLevel && ` · Livello ≥ ${lot.minLevel}`}
            </div>
          </div>
          <Badge variant={lot.status === "ACTIVE" ? "success" : "destructive"}>{lot.status === "ACTIVE" ? "Attivo" : "Disattivato"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={lot.usagePercent} />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <Stat label="Codici" v={lot.totalCodes} />
            <Stat label="Utilizzati" v={lot.usedCount} />
            <Stat label="Disponibili" v={lot.availableCount} />
            <Stat label="Scaduti" v={lot.expiredCount} />
            <div><div className="text-2xl font-bold">{lot.usagePercent.toLocaleString("it-IT")}%</div><div className="text-xs text-muted-foreground">Utilizzo</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run(() => exportPdfQr(lot, codes, (d, t) => setProgress(`QR ${fmtInt(d)} / ${fmtInt(t)}`)))} disabled={!!progress}><QrCode className="h-4 w-4" /> PDF QR (stampa)</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportPdfTable(lot, codes))} disabled={!!progress}><FileText className="h-4 w-4" /> PDF tabella</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportExcel(lot, codes))} disabled={!!progress}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportCsv(lot, codes))} disabled={!!progress}><Download className="h-4 w-4" /> CSV</Button>
            <span className="flex-1" />
            {lot.promotionId && <Button size="sm" variant="outline" onClick={cancelPromotion}><Ban className="h-4 w-4" /> Disattiva promozione</Button>}
            {lot.status === "ACTIVE" && <Button size="sm" variant="destructive" onClick={cancelLot}><Ban className="h-4 w-4" /> DISATTIVA LOTTO</Button>}
          </div>
          {progress && <p className="text-sm text-primary">{progress}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        {(["codes", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t === "codes" ? `Codici (${fmtInt(filtered.length)})` : `Storico utilizzi (${fmtInt(txs.length)})`}
          </button>
        ))}
      </div>

      {tab === "codes" && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Cerca codice…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </div>
              <Select className="w-44" value={filter} onChange={(e) => { setFilter(e.target.value as CodeStatus | ""); setPage(0); }}>
                <option value="">Tutti gli stati</option>
                {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">Codice</th><th>Valore</th><th>Stato</th><th className="hidden sm:table-cell">Utilizzato da</th><th className="hidden sm:table-cell">Data / ora</th><th className="hidden md:table-cell">Transazione</th><th></th></tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 font-mono font-semibold">{c.code}</td>
                    <td>{describeValue(lot)}</td>
                    <td><Badge variant={STATUS_BADGE[c.status].variant}>{STATUS_BADGE[c.status].label}</Badge></td>
                    <td className="hidden sm:table-cell text-xs">{c.usedBy ? (txs.find((t) => t.codeId === c.id)?.studentName ?? c.usedBy) : "—"}</td>
                    <td className="hidden sm:table-cell text-xs">{fmtDateTime(c.usedAt)}</td>
                    <td className="hidden md:table-cell text-xs font-mono">{c.transactionId ? `#${c.transactionId}` : "—"}</td>
                    <td className="text-right">{c.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => cancelCode(c)} title="Disattiva codice"><Ban className="h-4 w-4 text-destructive" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > PAGE && (
              <div className="flex items-center justify-between text-sm">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Precedente</Button>
                <span>Pagina {page + 1} / {Math.ceil(filtered.length / PAGE)}</span>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Successiva</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardContent className="pt-4">
            {txs.length === 0 && <p className="text-sm text-muted-foreground">Nessun utilizzo registrato.</p>}
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Transazione</th><th>Codice</th><th>Studente</th><th>Valore</th><th className="hidden sm:table-cell">Data / ora</th><th className="hidden md:table-cell">Dispositivo</th></tr></thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 font-mono">#{t.id}</td>
                    <td className="font-mono">{t.codeValue}</td>
                    <td>{t.studentName ?? t.studentId}</td>
                    <td>{t.points ? `+${t.points} punti` : `+${t.quantity} ${t.productKey ?? ""}`}</td>
                    <td className="hidden sm:table-cell text-xs">{fmtDateTime(t.createdAt)}</td>
                    <td className="hidden md:table-cell text-xs font-mono truncate max-w-32">{t.deviceId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const Stat = ({ label, v }: { label: string; v: number }) => (
  <div><div className="text-2xl font-bold">{fmtInt(v)}</div><div className="text-xs text-muted-foreground">{label}</div></div>
);
