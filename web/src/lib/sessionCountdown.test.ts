import { describe, expect, it } from "vitest";
import { decodeTokenExp, formatSessionCountdown } from "./sessionCountdown";

/** Builds an unsigned 3-segment JWT lookalike with the given payload. */
function tokenWithPayload(payload: object): string {
  return `hdr.${btoa(JSON.stringify(payload))}.sig`;
}

describe("decodeTokenExp", () => {
  it("reads the numeric exp from a JWT payload segment", () => {
    // Given: a token whose middle segment is base64 JSON with a numeric exp
    // When: the payload is decoded
    // Then: the exp seconds come back untouched
    expect(decodeTokenExp(tokenWithPayload({ sub: "u1", exp: 1900000000 }))).toBe(1900000000);
  });

  it("decodes base64url payloads (no padding, - and _ alphabet)", () => {
    // Given: a payload encoded base64url-style like a real JWT
    const payload = btoa(JSON.stringify({ exp: 1234567890 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // When: the payload is decoded
    // Then: the base64url alphabet is translated before parsing
    expect(decodeTokenExp(`h.${payload}.s`)).toBe(1234567890);
  });

  it("returns null for opaque (non-JWT) tokens", () => {
    expect(decodeTokenExp("admin-token")).toBeNull();
  });

  it("returns null when the payload is not valid base64 JSON", () => {
    expect(decodeTokenExp("h.!!!not-base64!!!.s")).toBeNull();
  });

  it("returns null when the payload carries no numeric exp", () => {
    expect(decodeTokenExp(tokenWithPayload({ sub: "u1" }))).toBeNull();
    expect(decodeTokenExp(tokenWithPayload({ exp: "soon" }))).toBeNull();
  });
});

describe("formatSessionCountdown", () => {
  const NOW_MS = 1_800_000_000_000;

  it("shows whole minutes left without a warning", () => {
    // Given: a session expiring in exactly 15 minutes
    // When: the countdown is formatted
    // Then: it reads as 15m with no warning flag
    expect(formatSessionCountdown(NOW_MS / 1000 + 15 * 60, NOW_MS)).toEqual({
      text: "Session 15m left",
      expired: false,
      warning: false,
    });
  });

  it("flags the warning under two minutes", () => {
    expect(formatSessionCountdown(NOW_MS / 1000 + 60, NOW_MS)).toEqual({
      text: "Session 1m left",
      expired: false,
      warning: true,
    });
  });

  it("is not warning at exactly two minutes", () => {
    expect(formatSessionCountdown(NOW_MS / 1000 + 120, NOW_MS).warning).toBe(false);
  });

  it("rounds up so one second still shows one minute", () => {
    expect(formatSessionCountdown(NOW_MS / 1000 + 1, NOW_MS).text).toBe("Session 1m left");
  });

  it("reports expiry at zero and below", () => {
    expect(formatSessionCountdown(NOW_MS / 1000, NOW_MS)).toEqual({
      text: "Session expired",
      expired: true,
      warning: true,
    });
    expect(formatSessionCountdown(NOW_MS / 1000 - 5, NOW_MS).text).toBe("Session expired");
  });
});
