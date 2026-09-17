import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "../lib/tokenStore";

/**
 * Route guard: renders the matched child route only when a session token exists,
 * otherwise redirects to /login preserving the attempted path in location state.
 */
export function RequireAuth() {
  const location = useLocation();
  const { token } = useSession();

  if (token === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const { token } = useSession();

  if (token !== null) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
