import { useState, type FormEvent } from "react";
import { Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";
import { LangSwitch } from "@/components/Layout";
import { useI18n } from "@/lib/i18n";

export default function Login() {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "in") await api.signIn(email, password);
      else await api.signUp(email, password, name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center">
          <Ticket className="h-10 w-10 text-primary" />
          <CardTitle>{t("appName")}</CardTitle>
          <LangSwitch />
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            {mode === "up" && <Field label={t("loginFullName")}><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
            <Field label={t("loginEmail")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t("loginPassword")}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? t("loginSignIn") : t("loginSignUp")}</Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? t("loginNoAccount") : t("loginHaveAccount")}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
