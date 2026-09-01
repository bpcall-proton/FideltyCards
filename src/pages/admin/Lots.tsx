import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { describeValue, type Lot } from "@/lib/types";
import { fmtDate, fmtInt } from "@/lib/utils";
import { Badge, Button, buttonVariants, Card, CardContent, Progress } from "@/components/ui";

export default function Lots() {
  const { t } = useI18n();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setLots(await api.listLots()); } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("lotsTitle")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Link to="/admin/generate" className={buttonVariants({ size: "sm" })}>{t("navGenerate")}</Link>
        </div>
      </div>
      {lots.length === 0 && !loading && <p className="text-muted-foreground">{t("lotsEmpty")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {lots.map((l) => (
          <Link key={l.id} to={`/admin/lots/${l.id}`}>
            <Card className="hover:border-primary transition-colors h-full">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground font-mono">{t("LOT")} #{l.lotNumber}</div>
                    <div className="font-semibold text-lg">{l.name}</div>
                    <div className="text-sm text-primary">{describeValue(l)}</div>
                  </div>
                  <Badge variant={l.status === "ACTIVE" ? "success" : "destructive"}>{l.status === "ACTIVE" ? t("lotActive") : t("lotCancelled")}</Badge>
                </div>
                <Progress value={l.usagePercent} />
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label={t("statCodes")} v={l.totalCodes} />
                  <Stat label={t("statUsed")} v={l.usedCount} />
                  <Stat label={t("statAvailable")} v={l.availableCount} />
                  <Stat label={t("statExpired")} v={l.expiredCount} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("statUsage")} {fmtInt(l.usagePercent)}%</span>
                  <span>{t("lotExpiry")}: {l.expiresAt ? fmtDate(l.expiresAt) : t("none")}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

const Stat = ({ label, v }: { label: string; v: number }) => (
  <div><div className="font-bold text-base">{fmtInt(v)}</div><div className="text-muted-foreground">{label}</div></div>
);
