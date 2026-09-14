import { NavLink, Outlet, useNavigate } from "react-router";
import { clearToken, useSession } from "../lib/tokenStore";

const GUEST_ITEMS = [
  { to: "/login", label: "Login" },
  { to: "/bootstrap", label: "Bootstrap" },
] as const;

const MEMBER_ITEMS = [
  { to: "/feeds", label: "Feeds" },
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

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-md px-3 py-2 text-sm ${
    isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;

/** App layout: dark sidebar rail whose nav and footer follow the live session. */
export function AppShell() {
  const { token, user } = useSession();
  const navigate = useNavigate();
  const items =
    token === null
      ? GUEST_ITEMS
      : [
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
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 p-4">
        <div className="mb-4 px-3 text-sm font-semibold tracking-wide text-white uppercase">
          SecNews CMS
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/feeds"} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {user !== null ? (
          <div className="mt-auto flex flex-col gap-2 border-t border-slate-700 pt-4">
            <div className="px-3">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <span className="mt-1 inline-block rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {user.role}
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Logout
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
