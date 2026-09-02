import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_SETTINGS, type AppSettings, type Goal } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui";

export default function Goals() {
  const { t } = useI18n();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [counterKey, setCounterKey] = useState("points");
  const [target, setTarget] = useState(300);
  const [reward, setReward] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [savedMsg, setSavedMsg] = useState(false);

  const load = async () => {
    const [g, s] = await Promise.all([api.listGoals(), api.getSettings()]);
    setGoals(g); setSettings(s);
  };
  useEffect(() => { void load(); }, []);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (settings.stampTarget < 1) return;
    await api.saveSettings({ ...settings, stampTarget: Math.round(settings.stampTarget), stampReward: settings.stampReward.trim() });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name || !reward || target < 1) return;
    const k = counterKey.trim();
    await api.saveGoal({ name, counterKey: /^(points|punti)$/i.test(k) ? "points" : k.toUpperCase(), target, reward });
    setName(""); setReward("");
    await load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("stTitle")}</CardTitle>
          <CardDescription>{t("stSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="grid grid-cols-2 gap-3">
            <Field label={t("stTarget")} hint={t("stTargetHint")}>
              <Input type="number" min={1} max={50} value={settings.stampTarget} onChange={(e) => setSettings({ ...settings, stampTarget: Number(e.target.value) })} />
            </Field>
            <Field label={t("stReward")}>
              <Input value={settings.stampReward} onChange={(e) => setSettings({ ...settings, stampReward: e.target.value })} placeholder={t("goalRewardPh")} required />
            </Field>
            <Field label={t("stExpiry")} hint={t("stExpiryHint")}>
              <Input type="number" min={0} max={365} value={settings.rewardExpiryDays} onChange={(e) => setSettings({ ...settings, rewardExpiryDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={settings.showPointsCard} onChange={(e) => setSettings({ ...settings, showPointsCard: e.target.checked })} />
              {t("stShowPoints")}
            </label>
            <Button type="submit" className="col-span-2">{savedMsg ? t("acSaved") : t("acSave")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("goalsTitle")}</CardTitle>
          <CardDescription>{t("goalsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <Field label={t("goalName")}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goalNamePh")} required /></Field>
            <Field label={t("goalCounter")} hint={t("goalCounterHint")}><Input value={counterKey} onChange={(e) => setCounterKey(e.target.value)} /></Field>
            <Field label={t("goalTarget")}><Input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
            <Field label={t("goalReward")}><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder={t("goalRewardPh")} required /></Field>
            <Button type="submit" className="col-span-2">{t("goalAdd")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 divide-y">
          {goals.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-muted-foreground">{g.counterKey === "points" ? t("vtPoints") : g.counterKey} → {g.target} · 🎁 {g.reward}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => { await api.deleteGoal(g.id); await load(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
          {goals.length === 0 && <p className="text-sm text-muted-foreground">{t("goalsEmpty")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
