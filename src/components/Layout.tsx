import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Ticket, ListOrdered, PlusCircle, QrCode, Trophy, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Select } from "./ui";
import { cn } from "@/lib/utils";

const adminNav = [
  { to: "/admin/generate", label: "Genera codici", icon: PlusCircle },
  { to: "/admin/lots", label: "Lotti", icon: ListOrdered },
  { to: "/admin/goals", label: "Obiettivi", icon: Target },
  { to: "/admin/notifications", label: "Notifiche", icon: Bell },
];
const studentNav = [
  { to: "/redeem", label: "Inserisci codice", icon: QrCode },
  { to: "/me", label: "I miei punti", icon: Trophy },
];

export default function Layout() {
  const { user, signOut, refresh } = useAuth();
  const nav = useNavigate();
  const items = user?.role === "admin" ? adminNav : studentNav;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Ticket className="h-5 w-5 text-primary" /> Fedeltà Codici
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent", isActive && "bg-sidebar-accent text-primary")
                }
              >
                <i.icon className="h-4 w-4" /> {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            {api.mode === "demo" && api.demoUsers && (
              <Select
                className="h-8 w-auto bg-sidebar-accent border-sidebar-border text-xs"
                value={user?.id ?? ""}
                onChange={async (e) => {
                  const u = await api.switchDemoUser!(e.target.value);
                  await refresh();
                  nav(u.role === "admin" ? "/admin/generate" : "/redeem");
                }}
              >
                {api.demoUsers().map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.role === "admin" ? "👑 " : "🎓 "}{u.name}
                  </option>
                ))}
              </Select>
            )}
            {api.mode === "supabase" && user && (
              <>
                <span className="hidden sm:inline text-xs opacity-80">{user.name}</span>
                <Button variant="ghost" size="sm" onClick={signOut} className="text-sidebar-foreground">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <nav className="md:hidden flex border-t border-sidebar-border">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive && "text-primary")}>
              <i.icon className="h-5 w-5" /> {i.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container flex-1 px-4 py-6">
        <Outlet />
      </main>
      {api.mode === "demo" && (
        <footer className="text-center text-xs text-muted-foreground py-3">
          Modalità demo (dati nel browser). Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY per usare il backend reale.
        </footer>
      )}
    </div>
  );
}
