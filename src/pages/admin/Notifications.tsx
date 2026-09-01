import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminNotification } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui";

export default function Notifications() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminNotification[]>([]);
  useEffect(() => {
    const load = async () => setItems(await api.listNotifications());
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6" /> {t("notifTitle")}</h1>
      {items.length === 0 && <p className="text-muted-foreground">{t("notifEmpty")}</p>}
      {items.map((n) => (
        <Card key={n.id}>
          <CardContent className="pt-4 text-sm">
            <div className="font-bold">🔔 {n.title}</div>
            {n.type === "GOAL_REACHED" && (
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 mt-2 text-muted-foreground">
                <span>{t("notifStudent")}</span><span className="text-foreground">{String(n.body.student_name)}</span>
                <span>{t("notifGoal")}</span><span className="text-foreground">{String(n.body.goal)} ({String(n.body.target)})</span>
                <span>{t("notifReward")}</span><span className="text-foreground">{String(n.body.reward)}</span>
                <span>{t("notifDate")}</span><span className="text-foreground">{fmtDateTime(n.createdAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
