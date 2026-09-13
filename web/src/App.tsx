import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { RoleGate } from "./components/RoleGate";
import { BootstrapPage } from "./pages/BootstrapPage";
import { BulletinPage } from "./pages/BulletinPage";
import { ClientsPage } from "./pages/ClientsPage";
import { FeedsPage } from "./pages/FeedsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { TicketsPage } from "./pages/TicketsPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bootstrap" element={<BootstrapPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/bulletin" element={<BulletinPage />} />
          <Route
            path="/users"
            element={
              <RoleGate roles={["admin"]}>
                <UsersPage />
              </RoleGate>
            }
          />
        </Route>
        <Route index element={<Navigate to="/feeds" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
