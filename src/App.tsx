import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider, useI18n } from "@/lib/i18n";
import Login from "@/pages/Login";
import Generate from "@/pages/admin/Generate";
import Lots from "@/pages/admin/Lots";
import LotDetail from "@/pages/admin/LotDetail";
import Goals from "@/pages/admin/Goals";
import Notifications from "@/pages/admin/Notifications";
import Redeem from "@/pages/student/Redeem";
import Me from "@/pages/student/Me";
import StudentCard from "@/pages/student/Card";
import Promotions from "@/pages/student/Promotions";

function Routed() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{t("loading")}</div>;
  if (!user) return <Login />;
  const isAdmin = user.role === "admin";
  const home = isAdmin ? "/admin/generate" : "/card";
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route path="/redeem" element={<Redeem />} />
        <Route path="/me" element={<Me />} />
        <Route path="/card" element={<StudentCard />} />
        <Route path="/promotions" element={<Promotions />} />
        {isAdmin && (
          <>
            <Route path="/admin/generate" element={<Generate />} />
            <Route path="/admin/lots" element={<Lots />} />
            <Route path="/admin/lots/:id" element={<LotDetail />} />
            <Route path="/admin/goals" element={<Goals />} />
            <Route path="/admin/notifications" element={<Notifications />} />
          </>
        )}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
