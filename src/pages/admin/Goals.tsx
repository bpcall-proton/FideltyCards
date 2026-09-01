import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Goal } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui";

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [counterKey, setCounterKey] = useState("points");
  const [target, setTarget] = useState(300);
  const [reward, setReward] = useState("");

  const load = async () => setGoals(await api.listGoals());
  useEffect(() => { void load(); }, []);

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
          <CardTitle>Obiettivi e premi</CardTitle>
          <CardDescription>Quando un contatore dello studente raggiunge il target, il premio si sblocca automaticamente e l'admin riceve una notifica.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <Field label="Nome obiettivo"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="300 punti" required /></Field>
            <Field label="Contatore" hint="'points' per i punti, oppure il prodotto (es. CAFFÈ)"><Input value={counterKey} onChange={(e) => setCounterKey(e.target.value)} /></Field>
            <Field label="Target"><Input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
            <Field label="Premio"><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Caffè gratis" required /></Field>
            <Button type="submit" className="col-span-2">Aggiungi obiettivo</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 divide-y">
          {goals.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-muted-foreground">{g.counterKey === "points" ? "Punti" : g.counterKey} → {g.target} · 🎁 {g.reward}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => { await api.deleteGoal(g.id); await load(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
          {goals.length === 0 && <p className="text-sm text-muted-foreground">Nessun obiettivo.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
