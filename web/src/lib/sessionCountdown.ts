const MINUTE_MS = 60_000;
const WARNING_MS = 2 * MINUTE_MS;

export interface SessionCountdown {
  readonly text: string;
  readonly expired: boolean;
  /** Under two minutes left — the UI renders the countdown in red. */
  readonly warning: boolean;
}

/** Decodes the JWT payload's numeric exp only — signature and claims beyond
 * exp are never touched (no secret handling client-side). Returns null for
 * opaque tokens or payloads without a numeric exp. */
export function decodeTokenExp(token: string): number | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const payload = segments[1] ?? "";
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    const exp = (parsed as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** "Session <Mm> left" (minutes round up), "Session expired" once exp passed;
 * warning flags the final two minutes. */
export function formatSessionCountdown(
  expSeconds: number,
  nowMs: number,
): SessionCountdown {
  const msLeft = expSeconds * 1000 - nowMs;
  if (msLeft <= 0) {
    return { text: "Session expired", expired: true, warning: true };
  }
  const minutesLeft = Math.ceil(msLeft / MINUTE_MS);
  return {
    text: `Session ${minutesLeft}m left`,
    expired: false,
    warning: msLeft < WARNING_MS,
  };
}
