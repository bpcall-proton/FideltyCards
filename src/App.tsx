import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Generate from "@/pages/admin/Generate";
import Lots from "@/pages/admin/Lots";
import LotDetail from "@/pages/admin/LotDetail";
import Goals from "@/pages/admin/Goals";
import Notifications from "@/pages/admin/Notifications";
import Redeem from "@/pages/student/Redeem";
import Me from "@/pages/student/Me";

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Caricamento…</div>;
  if (!user) return <Login />;
  const isAdmin = user.role === "admin";
  const home = isAdmin ? "/admin/generate" : "/redeem";
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route path="/redeem" element={<Redeem />} />
        <Route path="/me" element={<Me />} />
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
    <AuthProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AuthProvider>
  );
}
