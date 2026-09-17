import { Navigate, Route, Routes } from "react-router";
import { AccountPage } from "./pages/AccountPage";
import { AppShell } from "./components/AppShell";
import { GuestOnly, RequireAuth } from "./components/RequireAuth";
import { RoleGate } from "./components/RoleGate";
import { BootstrapPage } from "./pages/BootstrapPage";
import { BulletinPage } from "./pages/BulletinPage";
import { ClientsPage } from "./pages/ClientsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmailTemplatePage } from "./pages/EmailTemplatePage";
import { FeedItemsPage } from "./pages/feeds/FeedItemsPage";
import { FeedSourcesPage } from "./pages/feeds/FeedSourcesPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { OtxPulsesPage } from "./pages/otx/OtxPulsesPage";
import { PromptsPage } from "./pages/PromptsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { TicketDetailPage } from "./pages/tickets/TicketDetailPage";
import { TicketsListPage } from "./pages/tickets/TicketsListPage";
import { UsersPage } from "./pages/UsersPage";
import { useSession } from "./lib/tokenStore";

function IndexLanding() {
  const { token } = useSession();
  if (token === null) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/bootstrap" element={<BootstrapPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/account" element={<AccountPage />} />
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
          <Route
            path="/dashboard"
            element={
              <RoleGate roles={["admin", "editor", "analyst"]}>
                <DashboardPage />
              </RoleGate>
            }
          />
          <Route
            path="/reports"
            element={
              <RoleGate roles={["admin", "editor", "analyst"]}>
                <ReportsPage />
              </RoleGate>
            }
          />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/bulletin" element={<BulletinPage />} />
          <Route
            path="/otx"
            element={
              <RoleGate roles={["admin", "editor", "analyst"]}>
                <OtxPulsesPage />
              </RoleGate>
            }
          />
          <Route
            path="/email-template"
            element={
              <RoleGate roles={["admin"]}>
                <EmailTemplatePage />
              </RoleGate>
            }
          />
          <Route
            path="/prompts"
            element={
              <RoleGate roles={["admin"]}>
                <PromptsPage />
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
        <Route index element={<IndexLanding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
