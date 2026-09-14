import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "../lib/tokenStore";

interface RoleGateProps {
  /** Roles allowed to view the children. */
  roles: readonly string[];
  children: ReactNode;
}

/**
 * Renders children only when the live session role is allowed; otherwise
 * redirects to /tickets, which every role can open. A session without a
 * parseable user (token only) passes.
 */
export function RoleGate({ roles, children }: RoleGateProps) {
  const { token, user } = useSession();
  const allowed = user === null
    ? token !== null
    : roles.map((role) => role.toUpperCase()).includes(user.role);
  return allowed ? <>{children}</> : <Navigate to="/tickets" replace />;
}
