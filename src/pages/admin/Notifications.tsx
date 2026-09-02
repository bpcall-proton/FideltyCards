import { useCallback, useEffect, useState } from "react";
import { Bell, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminNotification } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardContent, Modal } from "@/components/ui";

const isPendingRequest = (n: AdminNotification) => n.type === "REWARD_REQUEST" && !n.readAt;

function useNotifications(intervalMs: number) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const load = useCallback(async () => setItems(await api.listNotifications().catch(() => [])), []);
  useEffect(() => {
    void load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);
  return { items, load };
}

function AcceptButton({ n, onDone }: { n: AdminNotification; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="lg" className="w-full font-black" disabled={busy}
      onClick={async () => { setBusy(true); try { await api.confirmReward(String(n.body.reward_id)); await onDone(); } finally { setBusy(false); } }}>
      <Gift className="h-5 w-5 mr-2" /> {t("nrAccept")}
    </Button>
  );
}

/** Popup admin: compare appena uno studente preme RISCATTA. */
export function RewardRequestPopup() {
  const { t } = useI18n();
  const { items, load } = useNotifications(5000);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const pending = items.filter(isPendingRequest).filter((n) => !dismissed.includes(n.id));
  const n = pending[0];
  if (!n) return null;
  return (
    <Modal open onClose={() => setDismissed([...dismissed, n.id])}>
      <div className="text-center space-y-3">
        <Gift className="h-14 w-14 text-primary mx-auto" />
        <h2 className="text-xl font-black">🔔 {t("nrTitle")}</h2>
        <div className="text-lg font-bold">{String(n.body.student_name)}</div>
        <div className="rounded-lg bg-primary/10 p-3 text-2xl font-black">🎁 {String(n.body.reward)}</div>
        <div className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
        <AcceptButton n={n} onDone={load} />
        <Button variant="outline" className="w-full" onClick={() => setDismissed([...dismissed, n.id])}>{t("rwLater")}</Button>
      </div>
    </Modal>
  );
}

export default function Notifications() {
  const { t } = useI18n();
  const { items, load } = useNotifications(10000);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6" /> {t("notifTitle")}</h1>
      {items.length === 0 && <p className="text-muted-foreground">{t("notifEmpty")}</p>}
      {items.map((n) => (
        <Card key={n.id} className={isPendingRequest(n) ? "border-primary border-2" : undefined}>
          <CardContent className="pt-4 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">🔔 {n.type === "REWARD_REQUEST" ? t("nrTitle") : n.title}</div>
              {n.type === "REWARD_REQUEST" && <Badge variant={n.readAt ? "secondary" : "default"}>{n.readAt ? t("nrAccepted") : t("nrPending")}</Badge>}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-muted-foreground">
              <span>{t("notifStudent")}</span><span className="text-foreground">{String(n.body.student_name)}</span>
              {n.type === "GOAL_REACHED" && <><span>{t("notifGoal")}</span><span className="text-foreground">{String(n.body.goal)} ({String(n.body.target)})</span></>}
              <span>{t("notifReward")}</span><span className="text-foreground">{String(n.body.reward)}</span>
              <span>{t("notifDate")}</span><span className="text-foreground">{fmtDateTime(n.createdAt)}</span>
            </div>
            {isPendingRequest(n) && <AcceptButton n={n} onDone={load} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
