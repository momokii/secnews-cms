import { NavLink, Outlet } from "react-router";

const NAV_ITEMS = [
  { to: "/login", label: "Login" },
  { to: "/bootstrap", label: "Bootstrap" },
  { to: "/feeds", label: "Feeds" },
  { to: "/tickets", label: "Tickets" },
  { to: "/integrations", label: "Integrations" },
  { to: "/clients", label: "Clients" },
  { to: "/bulletin", label: "Bulletin" },
  { to: "/users", label: "Users" },
] as const;

/** App layout: dark sidebar rail with route stubs + main content outlet. */
export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 p-4">
        <div className="mb-4 px-3 text-sm font-semibold tracking-wide text-white uppercase">
          SecNews CMS
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
