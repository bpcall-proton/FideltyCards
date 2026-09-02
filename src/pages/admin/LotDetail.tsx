import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Download, FileSpreadsheet, FileText, QrCode, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { exportCsv, exportExcel, exportPdfQr, exportPdfTable } from "@/lib/export";
import { codeFormatLabel, codeStatusLabel, describeValue, type Code, type CodeStatus, type Lot, type Transaction } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Progress, Select } from "@/components/ui";

const STATUS_VARIANT: Record<CodeStatus, "success" | "secondary" | "warning" | "destructive"> = {
  ACTIVE: "success",
  USED: "secondary",
  EXPIRED: "warning",
  CANCELLED: "destructive",
};

export default function LotDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
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
    setProgress(t("preparingFile"));
    try { await fn(); } finally { setProgress(null); }
  }

  async function cancelLot() {
    if (!lot || !confirm(t("confirmCancelLot", { n: lot.lotNumber }))) return;
    await api.cancelLot(lot.id);
    await load();
  }
  async function deleteLot() {
    if (!lot || !confirm(t("confirmDeleteLot", { n: lot.lotNumber }))) return;
    setProgress(t("ldDeleting"));
    try {
      await api.deleteLot(lot.id);
      navigate("/admin/lots");
    } catch (err) {
      setProgress(null);
      alert(err instanceof Error ? err.message : String(err));
    }
  }
  async function cancelCode(c: Code) {
    if (!confirm(t("confirmCancelCode", { c: c.code }))) return;
    await api.cancelCode(c.code);
    await load();
  }
  async function cancelPromotion() {
    if (!lot?.promotionId || !confirm(t("confirmCancelPromo"))) return;
    await api.cancelPromotion(lot.promotionId);
    await load();
  }

  if (!lot) return <p className="text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/lots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t("allLots")}</Link>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <div className="text-xs font-mono text-muted-foreground">{t("LOT")} #{lot.lotNumber}</div>
            <CardTitle className="text-2xl">{lot.name}</CardTitle>
            <div className="text-primary font-medium mt-1">{describeValue(lot)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {t("ldFormat")}: {codeFormatLabel(lot.codeFormat)} · {t("ldCreated")}: {fmtDate(lot.createdAt)} · {t("ldValidity")}: {lot.validFrom ? `${fmtDate(lot.validFrom)} → ` : ""}{lot.expiresAt ? fmtDate(lot.expiresAt) : t("ldNoExpiry")}
              {lot.maxCodesPerStudentPerDay && ` · ${t("ldMaxCodesDay", { n: lot.maxCodesPerStudentPerDay })}`}
              {lot.maxPointsPerStudentPerDay && ` · ${t("ldMaxPtsDay", { n: lot.maxPointsPerStudentPerDay })}`}
              {lot.maxTotalUses && ` · ${t("ldMaxUses", { n: fmtInt(lot.maxTotalUses) })}`}
              {lot.minLevel && ` · ${t("ldMinLevel", { n: lot.minLevel })}`}
            </div>
          </div>
          <Badge variant={lot.status === "ACTIVE" ? "success" : "destructive"}>{lot.status === "ACTIVE" ? t("lotActive") : t("lotCancelled")}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={lot.usagePercent} />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <Stat label={t("statCodes")} v={lot.totalCodes} />
            <Stat label={t("statUsed")} v={lot.usedCount} />
            <Stat label={t("statAvailable")} v={lot.availableCount} />
            <Stat label={t("statExpired")} v={lot.expiredCount} />
            <div><div className="text-2xl font-bold">{fmtInt(lot.usagePercent)}%</div><div className="text-xs text-muted-foreground">{t("statUsage")}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run(() => exportPdfQr(lot, codes, (d, tot) => setProgress(`QR ${fmtInt(d)} / ${fmtInt(tot)}`)))} disabled={!!progress}><QrCode className="h-4 w-4" /> {t("ldPdfQr")}</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportPdfTable(lot, codes))} disabled={!!progress}><FileText className="h-4 w-4" /> {t("ldPdfTable")}</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportExcel(lot, codes))} disabled={!!progress}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => exportCsv(lot, codes))} disabled={!!progress}><Download className="h-4 w-4" /> CSV</Button>
            <span className="flex-1" />
            {lot.promotionId && <Button size="sm" variant="outline" onClick={cancelPromotion}><Ban className="h-4 w-4" /> {t("ldCancelPromo")}</Button>}
            {lot.status === "ACTIVE" && <Button size="sm" variant="destructive" onClick={cancelLot}><Ban className="h-4 w-4" /> {t("ldCancelLot")}</Button>}
            {(lot.status !== "ACTIVE" || (lot.expiresAt && new Date(lot.expiresAt).getTime() <= Date.now())) && (
              <Button size="sm" variant="destructive" onClick={deleteLot} disabled={!!progress}><Trash2 className="h-4 w-4" /> {t("ldDeleteLot")}</Button>
            )}
          </div>
          {progress && <p className="text-sm text-primary">{progress}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        {(["codes", "history"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === tb ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {tb === "codes" ? t("ldTabCodes", { n: fmtInt(filtered.length) }) : t("ldTabHistory", { n: fmtInt(txs.length) })}
          </button>
        ))}
      </div>

      {tab === "codes" && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder={t("ldSearch")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </div>
              <Select className="w-44" value={filter} onChange={(e) => { setFilter(e.target.value as CodeStatus | ""); setPage(0); }}>
                <option value="">{t("ldAllStatuses")}</option>
                {(Object.keys(STATUS_VARIANT) as CodeStatus[]).map((k) => <option key={k} value={k}>{codeStatusLabel(k)}</option>)}
              </Select>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">{t("thCode")}</th><th>{t("thValue")}</th><th>{t("thStatus")}</th><th className="hidden sm:table-cell">{t("thUsedBy")}</th><th className="hidden sm:table-cell">{t("thDateTime")}</th><th className="hidden md:table-cell">{t("thTransaction")}</th><th></th></tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 font-mono font-semibold">{c.code}</td>
                    <td>{describeValue(lot)}</td>
                    <td><Badge variant={STATUS_VARIANT[c.status]}>{codeStatusLabel(c.status)}</Badge></td>
                    <td className="hidden sm:table-cell text-xs">{c.usedBy ? (txs.find((x) => x.codeId === c.id)?.studentName ?? c.usedBy) : "—"}</td>
                    <td className="hidden sm:table-cell text-xs">{fmtDateTime(c.usedAt)}</td>
                    <td className="hidden md:table-cell text-xs font-mono">{c.transactionId ? `#${c.transactionId}` : "—"}</td>
                    <td className="text-right">{c.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => cancelCode(c)} title={t("ldCancelCode")}><Ban className="h-4 w-4 text-destructive" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > PAGE && (
              <div className="flex items-center justify-between text-sm">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("prev")}</Button>
                <span>{t("pageOf", { a: page + 1, b: Math.ceil(filtered.length / PAGE) })}</span>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>{t("next")}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardContent className="pt-4">
            {txs.length === 0 && <p className="text-sm text-muted-foreground">{t("ldNoHistory")}</p>}
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">{t("thTransaction")}</th><th>{t("thCode")}</th><th>{t("thStudent")}</th><th>{t("thValue")}</th><th className="hidden sm:table-cell">{t("thDateTime")}</th><th className="hidden md:table-cell">{t("thDevice")}</th></tr></thead>
              <tbody>
                {txs.map((x) => (
                  <tr key={x.id} className="border-t">
                    <td className="py-2 font-mono">#{x.id}</td>
                    <td className="font-mono">{x.codeValue}</td>
                    <td>{x.studentName ?? x.studentId}</td>
                    <td>{x.points ? t("valPoints", { n: x.points }) : `+${x.quantity} ${x.productKey ?? ""}`}</td>
                    <td className="hidden sm:table-cell text-xs">{fmtDateTime(x.createdAt)}</td>
                    <td className="hidden md:table-cell text-xs font-mono truncate max-w-32">{x.deviceId ?? "—"}</td>
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
