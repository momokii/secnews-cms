import { clearToken, getToken } from "./tokenStore";

/** Error thrown for non-2xx API responses; `status` carries the HTTP status code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_PREFIX = "/api";
const LOGIN_PATH = "/login";

/** Production navigation on session expiry: full reload to /login. */
export function defaultUnauthorizedNavigator(path: string): void {
  window.location.assign(path);
}

let unauthorizedNavigator = defaultUnauthorizedNavigator;

/** Overrides the 401 redirect (used by tests and future router integration). */
export function setUnauthorizedNavigator(navigator: (path: string) => void): void {
  unauthorizedNavigator = navigator;
}

/**
 * Fetch wrapper for the SecNews API.
 *
 * - Prefixes the given path with /api (dev proxy forwards to the backend).
 * - Attaches `Authorization: Bearer <token>` from tokenStore when a token exists.
 * - On 401: clears the stored token, redirects to /login, and throws ApiError(401).
 * - On other non-2xx: throws ApiError with the response status.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers });

  if (response.status === 401) {
    clearToken();
    unauthorizedNavigator(LOGIN_PATH);
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, `API request failed with status ${response.status}`);
  }

  return response;
}
