const TOKEN_KEY = "secnews_token";

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
}
