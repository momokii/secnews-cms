import { describe, expect, it } from "vitest";
import {
  CreateExportBodySchema,
  ExportAuditSchema,
  ExportFormatEnum,
  ExportStatusEnum,
  ExportTypeEnum,
  FeedExportRowSchema,
  ListExportAuditQuerySchema,
  ListExportAuditResponseSchema,
  TicketExportRowSchema,
} from "../src/modules/exports/schema.js";

describe("export enums", () => {
  it("accepts every Prisma export format when format is CSV, JSON, or XLSX", () => {
    // Given: the three canonical formats / When: each is parsed / Then: all pass
    expect(ExportFormatEnum.options).toEqual(["CSV", "JSON", "XLSX"]);
    for (const format of ["CSV", "JSON", "XLSX"] as const) {
      expect(ExportFormatEnum.safeParse(format).success).toBe(true);
    }
  });

  it("rejects an unknown export format", () => {
    // Given: a made-up format / When: parsed / Then: rejected
    expect(ExportFormatEnum.safeParse("pdf").success).toBe(false);
  });

  it("accepts only FEED and TICKET as export types", () => {
    // Given: canonical and bogus types / When: parsed / Then: only canonical pass
    expect(ExportTypeEnum.options).toEqual(["FEED", "TICKET"]);
    expect(ExportTypeEnum.safeParse("FEED").success).toBe(true);
    expect(ExportTypeEnum.safeParse("TICKET").success).toBe(true);
    expect(ExportTypeEnum.safeParse("BULLETIN").success).toBe(false);
  });

  it("accepts only SUCCESS and FAILED as export statuses", () => {
    // Given: canonical and bogus statuses / When: parsed / Then: only canonical pass
    expect(ExportStatusEnum.options).toEqual(["SUCCESS", "FAILED"]);
    expect(ExportStatusEnum.safeParse("SUCCESS").success).toBe(true);
    expect(ExportStatusEnum.safeParse("PENDING").success).toBe(false);
  });
});

describe("CreateExportBodySchema", () => {
  it("accepts format alone", () => {
    // Given: a body with only the format / When: parsed / Then: it passes
    expect(CreateExportBodySchema.safeParse({ format: "CSV" }).success).toBe(true);
  });

  it("accepts date-only from/to bounds", () => {
    // Given: ISO date strings / When: parsed / Then: the range passes
    const parsed = CreateExportBodySchema.safeParse({
      format: "JSON",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts full datetime from/to bounds", () => {
    // Given: ISO datetime strings / When: parsed / Then: the range passes
    const parsed = CreateExportBodySchema.safeParse({
      format: "XLSX",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.999Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts from equal to to", () => {
    // Given: an inclusive single-day range / When: parsed / Then: it passes
    const parsed = CreateExportBodySchema.safeParse({
      format: "CSV",
      from: "2026-02-10",
      to: "2026-02-10",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a bad format with 400-grade failure", () => {
    // Given: an unknown format / When: parsed / Then: rejected
    expect(
      CreateExportBodySchema.safeParse({ format: "PDF" }).success,
    ).toBe(false);
  });

  it("rejects a non-date bound", () => {
    // Given: from is garbage / When: parsed / Then: rejected
    expect(
      CreateExportBodySchema.safeParse({ format: "CSV", from: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("rejects a range whose from is after to", () => {
    // Given: an inverted range / When: parsed / Then: rejected naming from
    const parsed = CreateExportBodySchema.safeParse({
      format: "CSV",
      from: "2026-03-01",
      to: "2026-02-01",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["from"]);
  });

  it("rejects an inverted datetime range", () => {
    // Given: inverted datetimes / When: parsed / Then: rejected
    expect(
      CreateExportBodySchema.safeParse({
        format: "JSON",
        from: "2026-03-01T12:00:00.000Z",
        to: "2026-03-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("ListExportAuditQuerySchema", () => {
  it("defaults page and pageSize when absent", () => {
    // Given: an empty query / When: parsed / Then: page defaults apply
    const parsed = ListExportAuditQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("coerces string page params from the wire", () => {
    // Given: query params as strings / When: parsed / Then: coerced to ints
    const parsed = ListExportAuditQuerySchema.parse({ page: "2", pageSize: "50" });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it("accepts every optional filter", () => {
    // Given: the full filter set / When: parsed / Then: all filters survive
    const parsed = ListExportAuditQuerySchema.parse({
      type: "TICKET",
      format: "XLSX",
      status: "FAILED",
      from: "2026-01-01",
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(parsed.type).toBe("TICKET");
    expect(parsed.format).toBe("XLSX");
    expect(parsed.status).toBe("FAILED");
    expect(parsed.from).toBe("2026-01-01");
    expect(parsed.to).toBe("2026-02-01T00:00:00.000Z");
  });

  it("rejects an unknown filter enum value", () => {
    // Given: a bogus status filter / When: parsed / Then: rejected
    expect(ListExportAuditQuerySchema.safeParse({ status: "QUEUED" }).success).toBe(false);
  });

  it("rejects an inverted from/to range", () => {
    // Given: an inverted audit range / When: parsed / Then: rejected
    expect(
      ListExportAuditQuerySchema.safeParse({ from: "2026-05-01", to: "2026-04-01" })
        .success,
    ).toBe(false);
  });
});

describe("ExportAuditSchema", () => {
  it("parses a full audit row with system-actor nulls", () => {
    // Given: a scheduled export with no actor and no range / When: parsed / Then: nulls preserved
    const parsed = ExportAuditSchema.parse({
      id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
      actorId: null,
      actorName: null,
      type: "FEED",
      format: "JSON",
      from: null,
      to: null,
      status: "SUCCESS",
      rowCount: 42,
      error: null,
      createdAt: "2026-09-16T10:00:00.000Z",
    });
    expect(parsed.actorId).toBeNull();
    expect(parsed.rowCount).toBe(42);
  });

  it("parses a failed actor-attributed export with error text", () => {
    // Given: a failed user-triggered export / When: parsed / Then: error and actor survive
    const parsed = ExportAuditSchema.parse({
      id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0e",
      actorId: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a",
      actorName: "Dana Analyst",
      type: "TICKET",
      format: "CSV",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.999Z",
      status: "FAILED",
      rowCount: null,
      error: "xlsx render blew up",
      createdAt: "2026-09-16T10:30:00.000Z",
    });
    expect(parsed.actorName).toBe("Dana Analyst");
    expect(parsed.error).toBe("xlsx render blew up");
  });

  it("rejects a row missing required fields", () => {
    // Given: a row without type/format/status/createdAt / When: parsed / Then: rejected
    expect(ExportAuditSchema.safeParse({ id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f" }).success).toBe(false);
  });
});

describe("ListExportAuditResponseSchema", () => {
  it("parses the paginated envelope around audit rows", () => {
    // Given: one audit row inside a page envelope / When: parsed / Then: items and paging survive
    const parsed = ListExportAuditResponseSchema.parse({
      items: [
        {
          id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
          actorId: null,
          actorName: null,
          type: "FEED",
          format: "CSV",
          from: null,
          to: null,
          status: "SUCCESS",
          rowCount: 7,
          error: null,
          createdAt: "2026-09-16T10:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it("rejects an envelope with a bad page number", () => {
    // Given: page 0 / When: parsed / Then: rejected
    expect(
      ListExportAuditResponseSchema.safeParse({
        items: [],
        total: 0,
        page: 0,
        pageSize: 20,
      }).success,
    ).toBe(false);
  });
});

describe("export row schemas", () => {
  it("TicketExportRowSchema parses full detail with nested sources and iocs", () => {
    // Given: a ticket detail incl nested collections / When: parsed / Then: nesting survives
    const parsed = TicketExportRowSchema.parse({
      id: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
      title: "Leaked creds on paste site",
      origin: "MANUAL",
      findingType: "OTHER",
      status: "OPEN",
      cveIds: [],
      affectedProduct: null,
      affectedVersions: null,
      mitigation: null,
      threatName: null,
      overview: null,
      description: null,
      recommendations: null,
      references: [],
      tlp: "AMBER",
      feedItemId: null,
      otxPulseId: null,
      otxPulseUrl: null,
      createdAt: "2026-09-16T08:00:00.000Z",
      updatedAt: "2026-09-16T08:00:00.000Z",
      takenByName: null,
      pendingSuggestions: 0,
      sources: [
        {
          id: "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a",
          ticketId: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
          url: "https://example.test/paste",
          note: null,
          title: "paste dump",
          notes: null,
          createdById: null,
          createdAt: "2026-09-16T08:01:00.000Z",
        },
      ],
      iocs: [
        {
          id: "4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a",
          ticketId: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
          type: "IPV4",
          value: "203.0.113.10",
          context: null,
          origin: null,
          includeInBulletin: true,
          createdById: null,
          createdAt: "2026-09-16T08:02:00.000Z",
        },
      ],
    });
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.iocs[0]?.value).toBe("203.0.113.10");
  });

  it("FeedExportRowSchema parses full feed-item detail with raw payload and source name", () => {
    // Given: a feed item detail incl raw + sourceName / When: parsed / Then: all fields survive
    const parsed = FeedExportRowSchema.parse({
      id: "5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a",
      feedSourceId: "6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a",
      guid: "guid-1",
      title: "New CVE blog post",
      url: "https://example.test/post",
      publishedAt: "2026-09-15T12:00:00.000Z",
      summary: "A writeup",
      status: "UNREVIEWED",
      ticketId: null,
      fetchedAt: "2026-09-15T13:00:00.000Z",
      sourceName: "Example Blog",
      raw: { title: "New CVE blog post" },
    });
    expect(parsed.sourceName).toBe("Example Blog");
    expect(parsed.raw).toEqual({ title: "New CVE blog post" });
  });

  it("row schemas reject rows missing nested collections", () => {
    // Given: a ticket row without sources/iocs / When: parsed / Then: rejected
    expect(
      TicketExportRowSchema.safeParse({
        id: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
        title: "Incomplete",
      }).success,
    ).toBe(false);
  });
});
