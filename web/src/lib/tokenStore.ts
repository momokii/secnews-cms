const TOKEN_KEY = "secnews_token";
const USER_KEY = "secnews_user";

export const USER_ROLES = ["ADMIN", "EDITOR", "ANALYST"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
};

/** Returns the stored session token, or null when signed out. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persists the session token for later Bearer attachment. */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Removes the session token (logout / 401 handling). */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setUser(user: SessionUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.email !== "string" ||
      typeof record.name !== "string" ||
      typeof record.role !== "string" ||
      !USER_ROLES.includes(record.role as UserRole)
    ) return null;
    return { id: record.id, email: record.email, name: record.name, role: record.role as UserRole };
  } catch {
    return null;
  }
}
