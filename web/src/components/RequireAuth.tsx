import { Navigate, Outlet, useLocation } from "react-router";
import { getToken } from "../lib/tokenStore";

/**
 * Route guard: renders the matched child route only when a session token exists,
 * otherwise redirects to /login preserving the attempted path in location state.
 */
export function RequireAuth() {
  const location = useLocation();
  const token = getToken();

  if (token === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
