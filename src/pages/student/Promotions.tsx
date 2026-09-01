import { useEffect, useState } from "react";
import { Gift, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { describeValue, type Promotion, type StudentStatus } from "@/lib/types";
import { fmtDate, fmtInt } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";

export default function Promotions() {
  const { t } = useI18n();
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [status, setStatus] = useState<StudentStatus | null>(null);

  useEffect(() => {
    void api.listPromotions().then(setPromos);
    void api.myStatus().then(setStatus);
  }, []);

  if (!promos || !status) return <p className="text-muted-foreground">{t("loading")}</p>;

  const validity = (p: Promotion) =>
    p.validFrom && p.expiresAt ? t("prValid", { a: fmtDate(p.validFrom), b: fmtDate(p.expiresAt) })
      : p.expiresAt ? t("prUntil", { d: fmtDate(p.expiresAt) }) : null;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6 text-primary" /> {t("prTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("prSubtitle")}</p>
      </div>

      {promos.length === 0 && <p className="text-sm text-muted-foreground">{t("prNone")}</p>}
      {promos.map((p) => (
        <Card key={p.id}>
          <CardContent className="pt-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-bold">{p.name}</div>
              {validity(p) && <div className="text-xs text-muted-foreground">{validity(p)}</div>}
            </div>
            <Badge variant="success">{describeValue(p)}</Badge>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> {t("prGoalsTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {status.goals.length === 0 && <p className="text-sm text-muted-foreground">{t("prNoGoals")}</p>}
          {status.goals.map((g) => {
            const v = status.counters[g.counterKey] ?? 0;
            const shown = Math.min(v % g.target === 0 && v > 0 ? g.target : v % g.target, g.target);
            return (
              <div key={g.id} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-muted-foreground">🎁 {g.reward}</span>
                </div>
                <Progress value={(100 * shown) / g.target} />
                <div className="text-xs text-muted-foreground">{t("prYouHave", { n: fmtInt(shown), t: fmtInt(g.target) })}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
