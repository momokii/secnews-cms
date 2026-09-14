import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { clearToken, useSession } from "../lib/tokenStore";

const NAV_COLLAPSED_KEY = "secnews_nav_collapsed";

const GUEST_ITEMS = [
  { to: "/login", label: "Login" },
  { to: "/bootstrap", label: "Bootstrap" },
] as const;

/** Feed-source configuration is manager-only; triage entries suit every role. */
const MGR_ITEMS = [
  { to: "/feeds", label: "Feeds" },
] as const;

const MEMBER_ITEMS = [
  { to: "/feeds/items", label: "Feed items" },
  { to: "/tickets", label: "Tickets" },
  { to: "/clients", label: "Clients" },
  { to: "/bulletin", label: "Bulletin" },
  { to: "/otx", label: "OTX pulses" },
] as const;

const ADMIN_ITEMS = [
  { to: "/integrations", label: "Integrations" },
  { to: "/users", label: "Users" },
] as const;

const ACCOUNT_ITEM = { to: "/account", label: "Account" } as const;

/** Inline SVG icon paths (24×24 stroke) keyed by route — DESIGN.md: inline
 * SVG only, no icon-font deps. */
const NAV_ICONS: Readonly<Record<string, string>> = {
  "/login": "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  "/bootstrap": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7 12 12l8.7-5M12 22V12",
  "/feeds": "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 20a2 2 0 1 0-4 0 2 2 0 0 0 4 0",
  "/feeds/items": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "/tickets": "M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2",
  "/clients": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "/bulletin": "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v5h5M16 13H8M16 17H8M10 9H8",
  "/otx": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10",
  "/integrations": "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  "/users": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  "/account": "M18 20a6 6 0 0 0-12 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};

const LOGOUT_ICON = "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9";
const BRAND_ICON = "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";
const COLLAPSE_ICON = "M11 17l-5-5 5-5M18 17l-5-5 5-5";
const EXPAND_ICON = "M13 17l5-5-5-5M6 17l5-5-5-5";

function NavIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4 shrink-0"}
    >
      <path d={d} />
    </svg>
  );
}

const navLinkClass =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }): string =>
    `flex items-center gap-2 rounded-md py-2 text-sm ${
      collapsed ? "justify-center px-2" : "px-3"
    } ${isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`;

/** App layout: dark sidebar rail whose nav and footer follow the live session;
 * the rail collapses to an icon-only strip persisted in localStorage. */
export function AppShell() {
  const { token, user } = useSession();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === "1",
  );

  const toggleCollapsed = (): void => {
    setCollapsed((current) => {
      localStorage.setItem(NAV_COLLAPSED_KEY, current ? "0" : "1");
      return !current;
    });
  };

  const isMgr = user?.role === "ADMIN" || user?.role === "EDITOR";
  const items =
    token === null
      ? GUEST_ITEMS
      : [
          ...(isMgr ? MGR_ITEMS : []),
          ...MEMBER_ITEMS,
          ...(user?.role === "ADMIN" ? ADMIN_ITEMS : []),
          ACCOUNT_ITEM,
        ];
  const logout = (): void => {
    clearToken();
    navigate("/login");
  };
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside
        className={`flex shrink-0 flex-col bg-slate-900 p-4 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div
          className={
            collapsed
              ? "mb-4 flex flex-col items-center gap-2"
              : "mb-4 flex items-center justify-between px-3"
          }
        >
          {collapsed ? (
            <NavIcon d={BRAND_ICON} className="h-5 w-5 shrink-0 text-white" />
          ) : (
            <div className="text-sm font-semibold tracking-wide text-white uppercase">
              SecNews CMS
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="primary-nav"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <NavIcon d={collapsed ? EXPAND_ICON : COLLAPSE_ICON} />
          </button>
        </div>
        <nav id="primary-nav" aria-label="Primary" className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/feeds"}
              className={navLinkClass(collapsed)}
              title={item.label}
            >
              <NavIcon d={NAV_ICONS[item.to] ?? NAV_ICONS["/account"]} />
              <span className={collapsed ? "hidden" : undefined}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {user !== null ? (
          <div className="mt-auto flex flex-col gap-2 border-t border-slate-700 pt-4">
            {collapsed ? null : (
              <div className="px-3">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <span className="mt-1 inline-block rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  {user.role}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={logout}
              title="Logout"
              className={
                collapsed
                  ? "flex justify-center rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              }
            >
              <NavIcon d={LOGOUT_ICON} />
              {collapsed ? null : <span>Logout</span>}
            </button>
          </div>
        ) : null}
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
