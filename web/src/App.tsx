import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { RoleGate } from "./components/RoleGate";
import { BootstrapPage } from "./pages/BootstrapPage";
import { BulletinPage } from "./pages/BulletinPage";
import { ClientsPage } from "./pages/ClientsPage";
import { FeedItemsPage } from "./pages/feeds/FeedItemsPage";
import { FeedSourcesPage } from "./pages/feeds/FeedSourcesPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { OtxPulsesPage } from "./pages/otx/OtxPulsesPage";
import { TicketDetailPage } from "./pages/tickets/TicketDetailPage";
import { TicketsListPage } from "./pages/tickets/TicketsListPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bootstrap" element={<BootstrapPage />} />
        <Route element={<RequireAuth />}>
          <Route
            path="/feeds"
            element={
              <RoleGate roles={["admin", "editor"]}>
                <FeedSourcesPage />
              </RoleGate>
            }
          />
          <Route path="/feeds/items" element={<FeedItemsPage />} />
          <Route path="/tickets" element={<TicketsListPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route
            path="/integrations"
            element={
              <RoleGate roles={["admin"]}>
                <IntegrationsPage />
              </RoleGate>
            }
          />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/bulletin" element={<BulletinPage />} />
          <Route
            path="/otx"
            element={
              <RoleGate roles={["admin", "editor"]}>
                <OtxPulsesPage />
              </RoleGate>
            }
          />
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
