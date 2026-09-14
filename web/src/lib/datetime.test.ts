import { describe, expect, it } from "vitest";
import { TIME_ZONE, formatTimestamp } from "./datetime";

describe("formatTimestamp", () => {
  it("renders an ISO instant as YYYY-MM-DD HH:mm in Asia/Jakarta (UTC+7)", () => {
    // Given: 10:00 UTC
    // When: formatted
    // Then: 17:00 WIB, same calendar date
    expect(formatTimestamp("2026-09-13T10:00:00.000Z")).toBe("2026-09-13 17:00");
  });

  it("rolls the calendar date when the WIB time crosses midnight", () => {
    // Given: 17:30 UTC on Jan 1
    // When: formatted
    // Then: Jan 2 00:30 WIB, zero-padded 24h clock
    expect(formatTimestamp("2026-01-01T17:30:00.000Z")).toBe("2026-01-02 00:30");
  });

  it("pins the display zone to Asia/Jakarta regardless of the host zone", () => {
    expect(TIME_ZONE).toBe("Asia/Jakarta");
  });
});
