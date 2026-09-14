import { clearToken, getToken } from "./tokenStore";

/** Error thrown for non-2xx API responses; `status` carries the HTTP status
 * code and `code` the machine error code (e.g. INACTIVE_TARGET) when the body
 * carries the standard { error: { code, message } } envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

interface ErrorBody {
  message?: string;
  code?: string;
}

/** Narrows the standard { error: { code, message } } envelope once. */
function readErrorBody(body: unknown): ErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) return {};
  const error: unknown = body.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return {};
  if (typeof error.message !== "string") return {};
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return { message: error.message, code };
}

/**
 * Fetch wrapper for the SecNews API.
 *
 * - Prefixes the given path with /api (dev proxy forwards to the backend).
 * - Attaches `Authorization: Bearer <token>` from tokenStore when a token exists.
 * - On 401: clears the stored token, redirects to /login, and throws ApiError(401).
 *   Pass `keepSessionOn401` for endpoints whose 401 is not a session expiry
 *   (e.g. self-service change-password with a wrong current password).
 * - On other non-2xx: throws ApiError with the response status.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: { readonly keepSessionOn401?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers });

  if (response.status === 401) {
    if (options.keepSessionOn401 !== true) {
      clearToken();
      unauthorizedNavigator(LOGIN_PATH);
    }
    const fallbackMessage = "Session expired. Please sign in again.";
    let body: ErrorBody = { message: fallbackMessage };
    try {
      body = { ...body, ...readErrorBody(await response.clone().json()) };
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new ApiError(401, body.message ?? fallbackMessage, body.code);
  }

  if (!response.ok) {
    let body: ErrorBody = {
      message: `API request failed with status ${response.status}`,
    };
    try {
      body = { ...body, ...readErrorBody(await response.clone().json()) };
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new ApiError(response.status, body.message ?? "API request failed", body.code);
  }

  return response;
}
