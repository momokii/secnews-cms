import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3FeedItem, c3User, type C3User } from "./tickets.fixtures.js";

/**
 * Export routes (app.inject against the dev DB): POST /exports/feeds and
 * POST /exports/tickets stream through the real runExport flow — download
 * headers on the wire, one SUCCESS ExportAudit row per run — and
 * GET /exports/audit paginates the trail with type/format/status/window
 * filters. Every surface is gated to signed-in ADMIN/EDITOR/ANALYST.
 */

// Deterministic past windows: only this suite's fixtures live there, so row
// counts are exact even on a shared dev database.
const TICKET_WINDOW = { from: "2020-01-05", to: "2020-01-05" };
const TICKET_CREATED_AT = new Date("2020-01-05T12:00:00.000Z");
const FEED_WINDOW = { from: "2021-03-07", to: "2021-03-07" };
const FEED_PUBLISHED_AT = new Date("2021-03-07T09:00:00.000Z");

describe("exports routes", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let editor: C3User;
  let analyst: C3User;
  const emails: string[] = [];
  const ticketIds: string[] = [];
  const feedItemIds: string[] = [];
  const feedSourceIds: string[] = [];
  const auditRowIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    editor = await c3User("EDITOR");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, editor.email, analyst.email);
  });

  afterAll(async () => {
    if (auditRowIds.length > 0) {
      await prisma.exportAudit.deleteMany({ where: { id: { in: auditRowIds } } });
    }
    await c3Cleanup({ ticketIds, feedItemIds, feedSourceIds, emails });
    await prisma.$disconnect();
  });

  async function seedTicketInWindow(): Promise<string> {
    const ticket = await prisma.ticket.create({
      data: {
        title: `export-route ${TICKET_WINDOW.from} ${crypto.randomUUID()}`,
        summary: "export route fixture",
        origin: "MANUAL",
        status: "OPEN",
        findingType: "OTHER",
        createdAt: TICKET_CREATED_AT,
        updatedAt: TICKET_CREATED_AT,
      },
      select: { id: true, title: true },
    });
    ticketIds.push(ticket.id);
    return ticket.title;
  }

  async function seedFeedItemInWindow(): Promise<string> {
    const { itemId, sourceId } = await c3FeedItem();
    feedItemIds.push(itemId);
    feedSourceIds.push(sourceId);
    await prisma.feedItem.update({
      where: { id: itemId },
      data: { publishedAt: FEED_PUBLISHED_AT },
    });
    return itemId;
  }

  async function seedAuditRow(input: {
    actorId: string | null;
    type: "FEED" | "TICKET";
    format: "CSV" | "JSON" | "XLSX";
    status: "SUCCESS" | "FAILED";
    rowCount: number;
    error?: string;
  }): Promise<string> {
    const row = await prisma.exportAudit.create({
      data: input,
      select: { id: true },
    });
    auditRowIds.push(row.id);
    return row.id;
  }

  /** The audit write races the streamed response end — poll until it lands.
   * The throw on the missing row is what drives the retry, and surfaces as
   * the failure message if the window elapses. */
  async function waitForAuditRow(where: {
    actorId: string | null;
    type: "FEED" | "TICKET";
    format: "CSV" | "JSON";
  }) {
    return vi.waitFor(
      async () => {
        const found = await prisma.exportAudit.findFirst({
          where,
          orderBy: { createdAt: "desc" },
        });
        if (found === null) {
          throw new Error("export audit row not written yet");
        }
        auditRowIds.push(found.id);
        return {
          id: found.id,
          status: found.status,
          rowCount: found.rowCount,
          error: found.error,
        };
      },
      { timeout: 5_000, interval: 50 },
    );
  }

  it("POST /exports/tickets streams CSV with download headers and audits SUCCESS", async () => {
    // Given: one ticket inside a deterministic single-day window
    const title = await seedTicketInWindow();

    // When: an ADMIN exports TICKET rows as CSV over that window
    const res = await app.inject({
      method: "POST",
      url: "/exports/tickets",
      headers: { authorization: bearer(admin, app) },
      payload: { format: "CSV", ...TICKET_WINDOW },
    });

    // Then: the stream carries the download headers and the ticket row, and
    // one SUCCESS audit row records the run with day-edge bounds and count 1
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("export-ticket-2020-01-05-2020-01-05.csv")}`,
    );
    expect(res.payload).toContain(title);
    expect(res.payload).toContain("status,count\nOPEN,1\n");
    const audit = await waitForAuditRow({
      actorId: admin.id,
      type: "TICKET",
      format: "CSV",
    });
    expect(audit?.status).toBe("SUCCESS");
    expect(audit?.rowCount).toBe(1);
    expect(audit?.error).toBeNull();
    const persisted = await prisma.exportAudit.findUniqueOrThrow({
      where: { id: audit.id },
      select: { from: true, to: true },
    });
    expect(persisted.from?.toISOString()).toBe("2020-01-05T00:00:00.000Z");
    expect(persisted.to?.toISOString()).toBe("2020-01-05T23:59:59.999Z");
  });

  it("POST /exports/feeds streams NDJSON bounded by publishedAt and audits SUCCESS", async () => {
    // Given: one feed item published inside a deterministic single-day window
    const itemId = await seedFeedItemInWindow();

    // When: an ANALYST (lowest allowed role) exports FEED rows as JSON
    const res = await app.inject({
      method: "POST",
      url: "/exports/feeds",
      headers: { authorization: bearer(analyst, app) },
      payload: { format: "JSON", ...FEED_WINDOW },
    });

    // Then: the ndjson stream holds the item row plus the meta line, the
    // download headers name the window, and a SUCCESS audit row lands
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/x-ndjson");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("export-feed-2021-03-07-2021-03-07.ndjson")}`,
    );
    const lines = res.payload.split("\n").filter((line) => line !== "");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(itemId);
    const metaLine = lines.at(1);
    if (metaLine === undefined) {
      throw new Error("expected a meta line in the ndjson payload");
    }
    expect(JSON.parse(metaLine)).toEqual({
      meta: { rowCount: 1, byStatus: { UNREVIEWED: 1 } },
    });
    const audit = await waitForAuditRow({
      actorId: analyst.id,
      type: "FEED",
      format: "JSON",
    });
    expect(audit?.status).toBe("SUCCESS");
    expect(audit?.rowCount).toBe(1);
    expect(audit?.error).toBeNull();
  });

  it("POST /exports/tickets rejects an unknown format with 400 VALIDATION", async () => {
    // Given: a signed-in ADMIN and a body whose format is not an ExportFormat
    // When: the export is requested
    const res = await app.inject({
      method: "POST",
      url: "/exports/tickets",
      headers: { authorization: bearer(admin, app) },
      payload: { format: "PDF" },
    });

    // Then: the canonical validation envelope comes back
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION" } });
  });

  it("POST /exports/feeds without a token answers 401 UNAUTHORIZED", async () => {
    // Given: no Authorization header
    // When: the feed export is requested
    const res = await app.inject({ method: "POST", url: "/exports/feeds", payload: {} });
    // Then: the auth gate fires before any export work
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("POST /exports/tickets without a token answers 401 UNAUTHORIZED", async () => {
    // Given: no Authorization header
    // When: the ticket export is requested
    const res = await app.inject({ method: "POST", url: "/exports/tickets", payload: {} });
    // Then: the auth gate fires before any export work
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  describe("GET /exports/audit", () => {
    let ticketCsvId: string;
    let systemFeedId: string;
    let failedXlsxId: string;

    beforeAll(async () => {
      ticketCsvId = await seedAuditRow({
        actorId: admin.id,
        type: "TICKET",
        format: "CSV",
        status: "SUCCESS",
        rowCount: 501,
      });
      systemFeedId = await seedAuditRow({
        actorId: null,
        type: "FEED",
        format: "JSON",
        status: "SUCCESS",
        rowCount: 502,
      });
      failedXlsxId = await seedAuditRow({
        actorId: editor.id,
        type: "TICKET",
        format: "XLSX",
        status: "FAILED",
        rowCount: 503,
        error: "route test boom",
      });
    });

    it("lists audit rows with joined actor names and the page envelope", async () => {
      // Given: three seeded rows — a user CSV export, a system feed export and
      // a failed editor XLSX export
      // When: the trail is listed unfiltered
      const res = await app.inject({
        method: "GET",
        url: "/exports/audit",
        headers: { authorization: bearer(admin, app) },
      });

      // Then: every seeded row appears with its actor resolution and the
      // standard pagination envelope
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: Array<Record<string, unknown>>;
        total: number;
        page: number;
        pageSize: number;
      };
      expect(body.page).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(3);
      const byId = new Map(body.items.map((item) => [item["id"] as string, item]));
      expect(byId.get(ticketCsvId)).toMatchObject({
        actorId: admin.id,
        actorName: "C3 ADMIN",
        type: "TICKET",
        format: "CSV",
        status: "SUCCESS",
        rowCount: 501,
        error: null,
      });
      expect(byId.get(systemFeedId)).toMatchObject({
        actorId: null,
        actorName: null,
        type: "FEED",
        format: "JSON",
        status: "SUCCESS",
        rowCount: 502,
      });
      expect(byId.get(failedXlsxId)).toMatchObject({
        actorId: editor.id,
        actorName: "C3 EDITOR",
        type: "TICKET",
        format: "XLSX",
        status: "FAILED",
        rowCount: 503,
        error: "route test boom",
      });
    });

    it("filters by type/format/status and by the run window", async () => {
      // Given: the same three seeded rows
      // When: the trail is filtered to TICKET + CSV + SUCCESS
      const filtered = await app.inject({
        method: "GET",
        url: "/exports/audit?type=TICKET&format=CSV&status=SUCCESS",
        headers: { authorization: bearer(admin, app) },
      });

      // Then: only the user CSV export matches
      expect(filtered.statusCode).toBe(200);
      const matches = filtered.json() as { items: Array<{ id: string }> };
      expect(matches.items.map((item) => item.id)).toContain(ticketCsvId);
      expect(matches.items.map((item) => item.id)).not.toContain(systemFeedId);
      expect(matches.items.map((item) => item.id)).not.toContain(failedXlsxId);

      // And: a window strictly before the seeded rows excludes all of them
      const oldWindow = await app.inject({
        method: "GET",
        url: "/exports/audit?from=2020-01-01&to=2020-01-02",
        headers: { authorization: bearer(admin, app) },
      });
      expect(oldWindow.statusCode).toBe(200);
      const oldIds = (oldWindow.json() as { items: Array<{ id: string }> }).items.map(
        (item) => item.id,
      );
      expect(oldIds).not.toContain(ticketCsvId);
      expect(oldIds).not.toContain(systemFeedId);
      expect(oldIds).not.toContain(failedXlsxId);
    });

    it("paginates with the shared page query", async () => {
      // Given: at least three audit rows exist
      // When: one row per page is requested
      const res = await app.inject({
        method: "GET",
        url: "/exports/audit?page=1&pageSize=1",
        headers: { authorization: bearer(admin, app) },
      });

      // Then: the envelope reports a single-item page
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: unknown[];
        total: number;
        page: number;
        pageSize: number;
      };
      expect(body.items).toHaveLength(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(3);
    });

    it("answers 401 without a token and 400 when from lands after to", async () => {
      // Given: no auth and an inverted window
      // When/Then: the auth gate fires first…
      const noAuth = await app.inject({ method: "GET", url: "/exports/audit" });
      expect(noAuth.statusCode).toBe(401);
      expect(noAuth.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });

      // …and a signed-in request with from > to gets the validation envelope
      const inverted = await app.inject({
        method: "GET",
        url: "/exports/audit?from=2026-02-02&to=2026-02-01",
        headers: { authorization: bearer(admin, app) },
      });
      expect(inverted.statusCode).toBe(400);
      expect(inverted.json()).toMatchObject({ error: { code: "VALIDATION" } });
    });
  });
});
