import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { getToken, getUser } from "../lib/tokenStore";

interface RoleGateProps {
  /** Roles allowed to view the children. */
  roles: readonly string[];
  children: ReactNode;
}

/**
 * Stub: renders children unconditionally and records the allowed roles as a data
 * attribute. Real role enforcement lands with the auth context wave (F1).
 */
export function RoleGate({ roles, children }: RoleGateProps) {
  const current = getUser();
  const allowed = current === null
    ? getToken() !== null
    : roles.map((role) => role.toUpperCase()).includes(current.role);
  return allowed ? <>{children}</> : <Navigate to="/feeds" replace />;
}
