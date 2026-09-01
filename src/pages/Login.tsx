import { useState, type FormEvent } from "react";
import { Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";

export default function Login() {
  const { refresh } = useAuth();
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
          <CardTitle>Fedeltà Codici</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            {mode === "up" && <Field label="Nome e cognome"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Accedi" : "Registrati"}</Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
