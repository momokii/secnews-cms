import type { ReactNode } from "react";

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
  return <div data-allowed-roles={roles.join(",")}>{children}</div>;
}
