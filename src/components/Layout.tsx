import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, Coffee, LogOut, Ticket, ListOrdered, PlusCircle, QrCode, CreditCard, Tag, Wallet, Target } from "lucide-react";
import { levelName, useStudent } from "@/lib/student";
import { fmtInt } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Select } from "./ui";
import { cn } from "@/lib/utils";
import { LANGS, useI18n, type I18nKey, type Lang } from "@/lib/i18n";

const adminNav: { to: string; label: I18nKey; icon: typeof Bell }[] = [
  { to: "/admin/generate", label: "navGenerate", icon: PlusCircle },
  { to: "/admin/lots", label: "navLots", icon: ListOrdered },
  { to: "/admin/goals", label: "navGoals", icon: Target },
  { to: "/admin/notifications", label: "navNotifications", icon: Bell },
];
const studentNav: typeof adminNav = [
  { to: "/me", label: "navBalance", icon: Wallet },
  { to: "/redeem", label: "navCode", icon: QrCode },
  { to: "/card", label: "navCard", icon: CreditCard },
  { to: "/promotions", label: "navPromos", icon: Tag },
];

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <Select className={cn("h-8 w-auto text-xs", className)} value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Language">
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
    </Select>
  );
}

function StudentLayout() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const { points } = useStudent();
  return (
    <div className="min-h-screen flex flex-col bg-[#fbf7f2] text-[#2b2118]">
      <header className="bg-white/90 backdrop-blur border-b border-[#eee3d8] sticky top-0 z-20">
        <div className="container flex h-[72px] items-center justify-between gap-4 px-4">
          <Link to="/me" className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary text-white grid place-items-center shadow"><Coffee className="h-6 w-6" /></div>
            <div className="leading-tight">
              <div className="font-bold">{user?.name}</div>
              <div className="text-xs font-semibold text-primary tracking-wide">{fmtInt(points)} {t("ptsUnit")} · {levelName(user?.level ?? 1)}</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-[15px] font-semibold text-[#7a6a5c]">
            {studentNav.map((i) => (
              <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("rounded-xl px-4 py-2 hover:text-[#2b2118]", isActive && "bg-primary/10 text-primary")}>
                {t(i.label)}
              </NavLink>
            ))}
            <button onClick={signOut} className="flex items-center gap-1.5 rounded-xl px-4 py-2 hover:text-[#2b2118]"><LogOut className="h-4 w-4" /> {t("navLogout")}</button>
          </nav>
          <div className="flex items-center gap-2">
            <LangSwitch className="bg-white border-[#eee3d8]" />
            <Button variant="ghost" size="sm" onClick={signOut} className="md:hidden" aria-label={t("navLogout")}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <nav className="md:hidden flex border-t border-[#eee3d8] bg-white">
          {studentNav.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-[#7a6a5c]", isActive && "text-primary")}>
              <i.icon className="h-5 w-5" /> {t(i.label)}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container flex-1 px-4 py-6 max-w-4xl">
        <Outlet />
      </main>
      <footer className="text-center py-6 space-y-1">
        <div className="text-xs font-bold tracking-wide text-[#5b4b3e]">{t("footTitle")}</div>
        <div className="text-xs text-[#9a8a7c]">{t("footNote")}</div>
        {api.mode === "demo" && <div className="text-xs text-muted-foreground pt-1">{t("demoFooter")}</div>}
      </footer>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  return user && user.role !== "admin" && api.mode === "firebase" ? <StudentLayout /> : <AdminLayout />;
}

function AdminLayout() {
  const { user, signOut, refresh } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const items = user?.role === "admin" ? adminNav : studentNav;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Ticket className="h-5 w-5 text-primary" /> {t("appName")}
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
                <i.icon className="h-4 w-4" /> {t(i.label)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <LangSwitch className="bg-sidebar-accent border-sidebar-border" />
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
            {api.mode === "firebase" && user && (
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
              <i.icon className="h-5 w-5" /> {t(i.label)}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container flex-1 px-4 py-6">
        <Outlet />
      </main>
      {api.mode === "demo" && (
        <footer className="text-center text-xs text-muted-foreground py-3">
          {t("demoFooter")}
        </footer>
      )}
    </div>
  );
}
