import { useState, type FormEvent } from "react";
import { LogOut, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { levelName } from "@/lib/student";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";

export default function Account() {
  const { t, lang, setLang } = useI18n();
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.updateName(name.trim());
      await refresh();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" /> {t("acTitle")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("acName")}</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground">{t("acEmail")}</div><div className="font-semibold break-all">{user.email ?? "—"}</div></div>
              <div><div className="text-muted-foreground">{t("acRole")}</div><div className="font-semibold">{user.role === "admin" ? t("acRoleAdmin") : t("acRoleStudent")}</div></div>
              {user.role !== "admin" && <div><div className="text-muted-foreground">{t("acLevel")}</div><div className="font-semibold">{levelName(user.level)}</div></div>}
            </div>
            <div className="space-y-1">
              <Label>{t("acLang")}</Label>
              <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || name.trim() === user.name}>{t("acSave")}</Button>
              {saved && <span className="text-sm text-emerald-700">{t("acSaved")}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
      <Button variant="outline" className="w-full" onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> {t("acLogout")}</Button>
    </div>
  );
}
